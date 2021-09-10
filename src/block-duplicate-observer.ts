import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, getClient, IProjectInfo, IProjectPageService , ILocationService} from "azure-devops-extension-api";
import { IWorkItemFormService, WorkItemQueryResult, WorkItemTrackingRestClient, WorkItemTrackingServiceIds } from "azure-devops-extension-api/WorkItemTracking";
import * as stringSimilarity from "string-similarity";
import * as striptags from "striptags";

class duplicateObserver {
    _workItemFormService: IWorkItemFormService;
    _locationService : ILocationService;
    _projectService : IProjectPageService;
    _timeout : NodeJS.Timeout;

    constructor(workItemFormService: IWorkItemFormService, locationService : ILocationService, projectService : IProjectPageService) {
        console.log("duplicateObserver.ctor");
        this._workItemFormService = workItemFormService;
        this._locationService = locationService;
        this._projectService = projectService;
    }

    public async validateWorkItem() {

        const hostBaseUrl = await this._locationService.getResourceAreaLocation(
            '5264459e-e5e0-4bd8-b118-0985e68a4ec5' // WIT
        );

        const project = await this._projectService.getProject();
        const client: WorkItemTrackingRestClient = getClient(WorkItemTrackingRestClient);
        const id: string = await this._workItemFormService.getFieldValue("System.Id", { returnOriginalValue: false }) as string;


        const title: string = await this._workItemFormService.getFieldValue("System.Title", { returnOriginalValue: false }) as string;
        const description: string = striptags(await this._workItemFormService.getFieldValue("System.Description", { returnOriginalValue: false }) as string);
        const type: string = await this._workItemFormService.getFieldValue("System.WorkItemType", { returnOriginalValue: false }) as string;

        // Search for existing WI's which are not closed and are of the same time of the current WI
        // TODO : Add Paging
        const wiqlResult: WorkItemQueryResult = await client.queryByWiql({
            query: `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = \'${type}\' AND [State] <> \'Closed\' ORDER BY [System.CreatedDate] DESC`
        }, project.name, null, false, 200);

        // Get a valid access token for our batch request
        const accessToken = await SDK.getAccessToken();

        // Setup our batch request payload we dont want everything only certain fields
        const requestBody = {
            "ids": wiqlResult.workItems.map(workitem => { return workitem.id; }),
            "$expand" : "None",
            "fields": [
              "System.Id",
              "System.Title",
              "System.Description"
            ]
        }

        // Get our WorkItem data
        const response = await fetch(`${hostBaseUrl}${project.name}/_apis/wit/workitemsbatch?api-version=6.0`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify( requestBody )
        })
        
        // Get The JSON response
        let workitems : any = await response.json();
        // console.dir(workitems);

        let duplicate : boolean = false;
        // Enumerate returned WI's and check for similarity of X 
        workitems.value.every((workitem : any) => {
            // ignore the current WI if editing existing one
            if(id &&
                workitem.id !== id )
            {
                var title_similarity : number = stringSimilarity.compareTwoStrings(title, workitem.fields['System.Title']);
                
                // Lets compare title first
                if (title_similarity >= 0.8) {
                    duplicate = true;
                    return false;
                }
                else{
                    // then compare the description
                    var description_similarity : number = stringSimilarity.compareTwoStrings(description, striptags(workitem.fields['System.Description']));
                    
                    if (description_similarity >= 0.8) {
                        duplicate = true;
                        return false;
                    }
                }
            }

            return true;
        });

        // Check if we have any other invalid fields
        const invalidFields = await this._workItemFormService.getInvalidFields();

        // Debugging
        invalidFields.forEach(invalid => {
            console.log(`Invalid Field '${invalid.description}'.`); 
        });

        // Show standard invalid field message if required
        if (invalidFields.length > 0) {
            // There are other invalid fields so skip checks and don't overwrite work item rule errors
            console.log(`Skip checks as we already have invalid fields.`); 
            return;
        }

        // did we find a duplicate?
        if(duplicate)
        {
            console.log(`Duplicate Work item.`); 
            this._workItemFormService.setError(`Duplicate Work item.`);
        }
        else
        {
            console.log(`Not a Duplicate Work item.`); 
            this._workItemFormService.clearError();
        }
    }

    // Called when the active work item is modified
    public async onFieldChanged(args: any) {
        console.log(`WorkItemForm.onFieldChanged().`);

        if(this._timeout) clearTimeout(this._timeout);
        this._timeout = setTimeout(() => {
            this.validateWorkItem();
        },1000);
    }

    // Called when a new work item is being loaded in the UI
    public async onLoaded(args: any) {
        console.log(`WorkItemForm.onLoaded().`);
        this.validateWorkItem();
    }

    // Called when the active work item is being unloaded in the UI
    public async onUnloaded(args: any) {
        console.log(`WorkItemForm.onUnloaded().`);
    }

    // Called after the work item has been saved
    public async onSaved(args: any) {
        console.log(`WorkItemForm.onSaved().`);
    }

    // Called when the work item is reset to its unmodified state (undo)
    public async onReset(args: any) {
        console.log(`WorkItemForm.onReset().`);
    }

    // Called when the work item has been refreshed from the server
    public async onRefreshed(args: any) {
        console.log(`WorkItemForm.onRefreshed().`);
        this.validateWorkItem();
    }
}

SDK.init(<SDK.IExtensionInitOptions>{ explicitNotifyLoaded: true });
SDK.ready().then(async () => {
    const locationService : ILocationService = await SDK.getService(CommonServiceIds.LocationService);
    const projectService : IProjectPageService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
    const workItemFormService: IWorkItemFormService = await SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);
    const observer: duplicateObserver = new duplicateObserver(workItemFormService,locationService, projectService);

    await SDK.register(SDK.getContributionId(), async () => {
        // Get the Work Item Form Service
        return observer;
    });

    // preload work items?

    await SDK.notifyLoadSucceeded();
});