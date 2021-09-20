import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, getClient, IProjectInfo, IProjectPageService, ILocationService } from "azure-devops-extension-api";
import { IWorkItemFormService, WorkItemQueryResult, WorkItemReference, WorkItemTrackingRestClient, WorkItemTrackingServiceIds, IWorkItemNotificationListener } from "azure-devops-extension-api/WorkItemTracking";
import * as dice from "fast-dice-coefficient";
import * as striptags from "striptags";
import Logger, { LogLevel } from "./logger";

class duplicateObserver implements IWorkItemNotificationListener {
    _similarityIndex: number = 0.8;
    _workItemFormService: IWorkItemFormService;
    _locationService: ILocationService;
    _projectService: IProjectPageService;
    _timeout: NodeJS.Timeout;
    _logger: Logger = new Logger(LogLevel.Info);

    constructor(workItemFormService: IWorkItemFormService, locationService: ILocationService, projectService: IProjectPageService) {
        this._workItemFormService = workItemFormService;
        this._locationService = locationService;
        this._projectService = projectService;
    }

    // main entrypoint for validation logic 
    public async validateWorkItem(title: string, description: string) {

        // Make sure we have either title or description else return
        if (!title &&
            !description) {
            this._logger.warn(`Title and/or Description are needed to perform similarity checks.`);
            return;
        }

        // Get the Orgs Base url for WIT Rest Calls
        const hostBaseUrl = await this._locationService.getResourceAreaLocation(
            '5264459e-e5e0-4bd8-b118-0985e68a4ec5' // WIT
        );

        // Get The current ADO Project we need the project name later
        const project = await this._projectService.getProject();

        // Get The WIT rest client
        const client: WorkItemTrackingRestClient = getClient(WorkItemTrackingRestClient);

        // We need a few fields from the current workitem to perform our similairty analysis
        let id: string = await this._workItemFormService.getFieldValue("System.Id", { returnOriginalValue: false }) as string;
        const type: string = await this._workItemFormService.getFieldValue("System.WorkItemType", { returnOriginalValue: false }) as string;

        if (id) {
            this._logger.debug(`System.Id is '${id}'.`);
        }
        else {
            this._logger.debug(`** New WorkItem **`);
            id = "-1";
        }

        this._logger.debug(`System.Title is '${title}'.`);
        this._logger.debug(`System.Description is '${description}'.`);
        this._logger.debug(`System.WorkItemType is '${type}'.`);

        let wiqlQuery: string = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = \'${type}\' AND [State] <> \'Closed\' ORDER BY [System.CreatedDate] DESC`;
        this._logger.debug(`WIQL Query is '${wiqlQuery}'.`);

        // Search for existing WI's which are not closed and are of the same type of the current WI
        const wiqlResult: WorkItemQueryResult = await client.queryByWiql({
            query: wiqlQuery
        }, project.name);

        this._logger.debug(`WorkItem Count is '${wiqlResult.workItems.length}'.`);

        // Process the returned WI's in batches of 200
        let promises: Array<Promise<boolean>> = [], i: number, j: number, chunk_items: Array<WorkItemReference>, chunk: number = 200;
        for (i = 0, j = wiqlResult.workItems.length; i < j; i += chunk) {
            // Get The current batch
            chunk_items = wiqlResult.workItems.slice(i, i + chunk);
            // Setup our batch request payload we dont want everything only certain fields
            promises.push(this.validateWorkItemChunk(hostBaseUrl, project.name, id, this.normalizeString(title), this.normalizeString(description), chunk_items));
        }

        // Wait for any one of our promises to return bool(true) result then continue
        const duplicate: boolean = await this.getfirstResolvedPromise(promises);

        // Check if we have any other invalid fields
        const invalidFields = await this._workItemFormService.getInvalidFields();

        // Debugging
        invalidFields.forEach(invalid => {
            this._logger.debug(`Invalid Field '${invalid.description}'.`);
        });

        // Show standard invalid field message if required
        if (invalidFields.length > 0) {
            // There are other invalid fields so skip checks and don't overwrite work item rule errors
            this._logger.debug(`Skip checks as we already have invalid fields.`);
            return;
        }

        // did we find any duplicates?
        if (duplicate) {
            this._logger.info(`Duplicate Work item.`);
            this._workItemFormService.setError(`Duplicate Work item.`);
        }
        else {
            this._logger.info(`Not a Duplicate Work item.`);
            this._workItemFormService.clearError();
        }
    }

    private normalizeString(orignial_text: string): string {
        if (orignial_text)
            return striptags(orignial_text).trim().toLowerCase();
        else
            return "";
    }

    // perform similarity logic on a batch of WI's
    private async validateWorkItemChunk(hostBaseUrl: string, projectName: string, currentWorkItemId: string, currentWorkItemTitle: string, currentWorkItemDescription: string, workItemsChunk: Array<WorkItemReference>): Promise<boolean> {
        // Prepare our request body for this batch, only request title and description
        const requestBody = {
            "ids": workItemsChunk.map(workitem => { return workitem.id; }),
            "$expand": "None",
            "fields": [
                "System.Id",
                "System.Title",
                "System.Description"
            ]
        }

        // Get a valid access token for our batch request
        const accessToken = await SDK.getAccessToken();

        // return a promise
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                // Get our WorkItem data using the batch api
                const response: Response = await fetch(`${hostBaseUrl}${projectName}/_apis/wit/workitemsbatch?api-version=6.0`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                })

                let duplicate: boolean = false;

                // Get The JSON response
                let workitems: any = await response.json();
                let filtered_workitems: Array<any> = workitems.value.filter((workitem: any) => workitem.id !== currentWorkItemId);

                this._logger.debug("filtered_workitems", filtered_workitems);

                // first check for match title is fastest as shortest text
                if (currentWorkItemTitle) {
                    filtered_workitems.every((workitem: any) => {
                        var title_match: number = dice(currentWorkItemTitle, this.normalizeString(workitem.fields['System.Title']));
                        this._logger.debug("title_match", title_match);

                        if (title_match >= this._similarityIndex) {
                            this._logger.info(`Matched title ${title_match} on work item id ${workitem.id}.`);
                            duplicate = true;
                            return false;
                        }
                        return true;
                    });
                }

                // we didnt find a matching title then lets look at the descriptions
                if (!duplicate &&
                    currentWorkItemDescription) {
                    filtered_workitems.every((workitem: any) => {
                        var description_match: number = dice(currentWorkItemDescription, workitem.fields['System.Description']);
                        this._logger.debug("description_match", description_match);

                        if (description_match >= this._similarityIndex) {
                            this._logger.info(`Matched description ${description_match} on work item id ${workitem.id}.`);
                            duplicate = true;
                            return false;
                        }
                        return true;
                    });
                }

                resolve(duplicate);
            }
            catch (error) {
                // unhandled error
                reject(false);
                this._logger.error(error);
            }
        });
    }

    // function to get first promise which resolves to true result
    private async getfirstResolvedPromise(promises: Array<Promise<boolean>>): Promise<boolean> {
        const newPromises: Promise<boolean>[] = promises.map(p => new Promise<boolean>(
            (resolve, reject) => p.then(v => v && resolve(true), reject)
        ));
        newPromises.push(Promise.all(promises).then(() => false));
        return Promise.race(newPromises);
    }

    // Called when the active work item is modified
    public async onFieldChanged(args: any) {
        this._logger.debug(`WorkItemForm.onFieldChanged().`);
        this._logger.debug("args", args);
        const changedFields = args.changedFields;

        let title: string = changedFields["System.Title"] as string;
        let description: string = changedFields["System.Description"] as string;

        if (title ||
            description) {
            // when changes are made wait a bit before triggering the validation
            if (this._timeout) clearTimeout(this._timeout);
            this._logger.debug(`Setting timer for triggering validation.`);
            this._timeout = setTimeout(async () => {
                this._logger.debug(`Triggering validation.`);
                this.validateWorkItem(title, description);
            }, 2000);
        }
    }

    public async changedFields(args: any) {
        this._logger.debug(`WorkItemForm.changedFields().`);
    }

    // Called when a new work item is being loaded in the UI
    public async onLoaded(args: any) {
        this._logger.debug(`WorkItemForm.onLoaded().`);

        const title: string = await this._workItemFormService.getFieldValue("System.Title", { returnOriginalValue: false }) as string;
        const description: string = await this._workItemFormService.getFieldValue("System.Description", { returnOriginalValue: false }) as string;

        if (title ||
            description) {
            this.validateWorkItem(title, description);
        }
    }

    // Called when the work item is reset to its unmodified state (undo)
    public async onReset(args: any) {
        this._logger.debug(`WorkItemForm.onReset().`);
    }

    // Called when the work item has been refreshed from the server
    public async onRefreshed(args: any) {
        this._logger.debug(`WorkItemForm.onRefreshed().`);

        const title: string = await this._workItemFormService.getFieldValue("System.Title", { returnOriginalValue: false }) as string;
        const description: string = await this._workItemFormService.getFieldValue("System.Description", { returnOriginalValue: false }) as string;

        if (title ||
            description) {
            this.validateWorkItem(title, description);
        }
    }

    // Called after the work item has been saved
    public async onSaved(args: any) {
        this._logger.debug(`WorkItemForm.onSaved().`);
    }

    // Called when the active work item is being unloaded in the UI
    public async onUnloaded(args: any) {
        this._logger.debug(`WorkItemForm.onUnloaded().`);
    }
}

export async function main(): Promise<void> {
    await SDK.init();

    // wait until we are ready
    await SDK.ready();

    SDK.register(SDK.getContributionId(), async () => {
        // Get The ADO Services which we will need later
        const locationService: ILocationService = await SDK.getService(CommonServiceIds.LocationService);
        const projectService: IProjectPageService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const workItemFormService: IWorkItemFormService = await SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);

        // Get the observer
        return new duplicateObserver(workItemFormService, locationService, projectService);
    });
};

// execute our entrypoint
main().catch((error) => { console.error(error); });