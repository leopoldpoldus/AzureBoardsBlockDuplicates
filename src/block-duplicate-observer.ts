import * as SDK from 'azure-devops-extension-sdk';
import {
  CommonServiceIds,
  getClient,
  IProjectPageService,
  ILocationService,
  IExtensionDataService,
  IExtensionDataManager,
  IProjectInfo,
} from 'azure-devops-extension-api';
import {
  IWorkItemFormService,
  WorkItemQueryResult,
  WorkItemReference,
  WorkItemTrackingRestClient,
  WorkItemTrackingServiceIds,
  IWorkItemNotificationListener,
  IWorkItemFieldChangedArgs,
  IWorkItemLoadedArgs,
  IWorkItemChangedArgs,
} from 'azure-devops-extension-api/WorkItemTracking';
import dice from 'fast-dice-coefficient';
import striptags from 'striptags';
import originalFetch from 'isomorphic-fetch';
import fetchBuilder from 'fetch-retry';
import Logger, { LogLevel } from './logger';

class duplicateObserver implements IWorkItemNotificationListener {
  _workItemFormService: IWorkItemFormService;
  _locationService: ILocationService;
  _projectService: IProjectPageService;
  _dataService: IExtensionDataService;
  _timeout: NodeJS.Timeout | undefined;
  _logger: Logger = new Logger(LogLevel.Info);
  _statusCodes = [503, 504];
  _options = {
    retries: 3,
    retryDelay: (attempt: number, error: Error, response: Response) => {
      const delay: number = Math.pow(2, attempt) * 1000;
      this._logger.info(
        `retrying, delay ${delay}s before attempt number ${attempt + 1}`
      );
      this._logger.debug(`retryDelay ${error}, status ${response.status}`);
      return delay;
    },
    retryOn: (attempt: number, error: Error, response: Response) => {
      // retry on any network error, or specific status codes
      if (error !== null || this._statusCodes.includes(response.status)) {
        this._logger.info(`retrying, attempt number ${attempt + 1}`);
        this._logger.debug(`retryOn ${error}, status ${response.status}`);
        return true;
      }
    },
  };

  _fetch: (
    input: RequestInfo,
    init?: fetchBuilder.RequestInitWithRetry
  ) => Promise<Response> = fetchBuilder(originalFetch, this._options);

  constructor(
    workItemFormService: IWorkItemFormService,
    locationService: ILocationService,
    projectService: IProjectPageService,
    dataService: IExtensionDataService
  ) {
    this._workItemFormService = workItemFormService;
    this._locationService = locationService;
    this._projectService = projectService;
    this._dataService = dataService;
    this._timeout = undefined;
  }

  // main entrypoint for validation logic
  public async validateWorkItem(title: string, description: string) {
    // if we werent supplied a title lets get the current title
    if (!title) {
      title = (await this._workItemFormService.getFieldValue('System.Title', {
        returnOriginalValue: false,
      })) as string;
    }

    // if we werent supplied a description lets get the current title
    if (!description) {
      description = (await this._workItemFormService.getFieldValue(
        'System.Description',
        { returnOriginalValue: false }
      )) as string;
    }

    // Make sure we have either title or description else return
    if (!title && !description) {
      this._logger.warn(
        'Title and/or Description are needed to perform similarity checks.'
      );
      return;
    }

    // Get the Orgs Base url for WIT Rest Calls
    const hostBaseUrl = await this._locationService.getResourceAreaLocation(
      '5264459e-e5e0-4bd8-b118-0985e68a4ec5' // WIT
    );

    // Get The current ADO Project we need the project name later
    const project: IProjectInfo | undefined =
      await this._projectService.getProject();

    // Get The WIT rest client
    const client: WorkItemTrackingRestClient = getClient(
      WorkItemTrackingRestClient
    );

    // We need a few fields from the current workitem to perform our similairty analysis
    let id: string = (await this._workItemFormService.getFieldValue(
      'System.Id',
      { returnOriginalValue: false }
    )) as string;
    const type: string = (await this._workItemFormService.getFieldValue(
      'System.WorkItemType',
      { returnOriginalValue: false }
    )) as string;

    const similarityIndex: number = await this.getSimilarityIndex();
    const includeTitle: boolean = await this.getIncludeTitle();
    const includeDesciption: boolean = await this.getIncludeDesciption();
    const sameType: boolean = await this.getSameType();

    if (id) {
      this._logger.debug(`System.Id is '${id}'.`);
    } else {
      this._logger.debug('** New WorkItem **');
      id = '-1';
    }

    this._logger.debug(`System.Title is '${title}'.`);
    this._logger.debug(`System.Description is '${description}'.`);
    this._logger.debug(`System.WorkItemType is '${type}'.`);
    this._logger.debug(`similarityIndex is '${similarityIndex}'.`);
    this._logger.debug(`includeTitle is '${includeTitle}'`);
    this._logger.debug(`includeDesciption is '${includeDesciption}'`);
    this._logger.debug(`sameType is '${sameType}'`);

    const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE ${
      sameType ? `[System.WorkItemType] = '${type}' AND ` : ''
    }[State] <> 'Closed' AND ([System.Title] <> '' OR [System.Description] <> '') ORDER BY [System.CreatedDate] DESC`;
    this._logger.debug(`WIQL Query is '${wiqlQuery}'.`);

    let duplicate = false;

    if (project) {
      // Search for existing WI's which are not closed and are of the same type of the current WI
      const wiqlResult: WorkItemQueryResult = await client.queryByWiql(
        {
          query: wiqlQuery,
        },
        project.name
      );

      this._logger.debug(`WorkItem Count is '${wiqlResult.workItems.length}'.`);

      // Process the returned WI's in batches of 200
      const promises: Array<Promise<boolean>> = [],
        chunk = 200;
      let i: number, j: number, chunk_items: Array<WorkItemReference>;

      for (i = 0, j = wiqlResult.workItems.length; i < j; i += chunk) {
        // Get The current batch
        chunk_items = wiqlResult.workItems.slice(i, i + chunk);
        // Setup our batch request payload we dont want everything only certain fields
        promises.push(
          this.validateWorkItemChunk(
            hostBaseUrl,
            project.name,
            id,
            this.normalizeString(title),
            this.normalizeString(description),
            similarityIndex,
            includeTitle,
            includeDesciption,
            chunk_items
          )
        );
      }

      // Wait for any one of our promises to return bool(true) result then continue
      duplicate = await this.getfirstResolvedPromise(promises);
    }

    // Check if we have any other invalid fields
    const invalidFields = await this._workItemFormService.getInvalidFields();

    // Debugging
    invalidFields.forEach((invalid) => {
      this._logger.debug(`Invalid Field '${invalid.description}'.`);
    });

    // Show standard invalid field message if required
    if (invalidFields.length > 0) {
      // There are other invalid fields so skip checks and don't overwrite work item rule errors
      this._logger.debug('Skip checks as we already have invalid fields.');
      return;
    }

    // did we find any duplicates?
    if (duplicate) {
      const typeFilter: string = sameType ? 'of the same type ' : '';
      if (includeTitle && includeDesciption) {
        this._logger.info(
          `A duplicate work item ${typeFilter}exists with similar title and description.`
        );
        this._workItemFormService.setError(
          `A duplicate work item ${typeFilter}exists with similar title and description.`
        );
      } else if (includeTitle) {
        this._logger.info(
          `A duplicate work item ${typeFilter}exists with similar title.`
        );
        this._workItemFormService.setError(
          `A duplicate work item ${typeFilter}exists with similar title.`
        );
      } else {
        this._logger.info(
          `A duplicate work item ${typeFilter}exists with similar description.`
        );
        this._workItemFormService.setError(
          `A duplicate work item ${typeFilter}exists with similar description.`
        );
      }
    } else {
      this._logger.info('Not a Duplicate Work item.');
      this._workItemFormService.clearError();
    }
  }

  // Remove things we dont want to compare on and ensure comparison based on lower case strings
  private normalizeString(orignial_text: string): string {
    if (orignial_text && orignial_text !== '')
      return striptags(orignial_text)
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '') // !"#$%&'()*+,-./:;?@[\]^_`{|}~
        .replace(/\s{2,}/g, ' ')
        .trim()
        .toLowerCase();
    else return '';
  }

  // Get stored index or return default
  private async getSimilarityIndex(): Promise<number> {
    const dataManager: IExtensionDataManager =
      await this._dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );

    // Get current value for setting
    let similarityIndex: number = await dataManager.getValue<number>(
      'SimilarityIndex',
      {
        scopeType: 'Default',
      }
    );

    // Set our defaults if the key does not already exist
    if (!similarityIndex) {
      similarityIndex = await dataManager.setValue<number>(
        'SimilarityIndex',
        0.8,
        {
          scopeType: 'Default',
        }
      );
    }

    return similarityIndex;
  }

  // Get stored index or return default
  private async getIncludeTitle(): Promise<boolean> {
    const dataManager: IExtensionDataManager =
      await this._dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );

    // Get current value for setting
    let includeTitle: boolean = await dataManager.getValue<boolean>(
      'IncludeTitle',
      {
        scopeType: 'Default',
      }
    );

    if (includeTitle == null) {
      includeTitle = await dataManager.setValue<boolean>('IncludeTitle', true, {
        scopeType: 'Default',
      });
    }

    return includeTitle;
  }

  // Get stored index or return default
  private async getIncludeDesciption(): Promise<boolean> {
    const dataManager: IExtensionDataManager =
      await this._dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );

    // Get current value for setting
    let includeDesciption: boolean = await dataManager.getValue<boolean>(
      'IncludeDesciption',
      {
        scopeType: 'Default',
      }
    );

    if (includeDesciption == null) {
      includeDesciption = await dataManager.setValue<boolean>(
        'IncludeDesciption',
        true,
        {
          scopeType: 'Default',
        }
      );
    }

    return includeDesciption;
  }

  // Get stored index or return default
  private async getSameType(): Promise<boolean> {
    const dataManager: IExtensionDataManager =
      await this._dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );

    // Get current value for setting
    let sameType: boolean = await dataManager.getValue<boolean>('SameType', {
      scopeType: 'Default',
    });

    if (sameType == null) {
      sameType = await dataManager.setValue<boolean>('SameType', true, {
        scopeType: 'Default',
      });
    }

    return sameType;
  }

  // perform similarity logic on a batch of WI's
  private async validateWorkItemChunk(
    hostBaseUrl: string,
    projectName: string,
    currentWorkItemId: string,
    currentWorkItemTitle: string,
    currentWorkItemDescription: string,
    similarityIndex: number,
    includeTitle: boolean,
    includeDesciption: boolean,
    workItemsChunk: Array<WorkItemReference>
  ): Promise<boolean> {
    // Prepare our request body for this batch, only request title and description
    const requestBody = {
      ids: workItemsChunk.map((workitem) => {
        return workitem.id;
      }),
      $expand: 'None',
      fields: ['System.Id', 'System.Title', 'System.Description'],
    };

    // Get a valid access token for our batch request
    const accessToken = await SDK.getAccessToken();

    // return a promise
    return new Promise<boolean>((resolve, reject) => {
      try {
        // Get our WorkItem data using the batch api
        this._fetch(
          `${hostBaseUrl}${projectName}/_apis/wit/workitemsbatch?api-version=6.0`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }
        )
          .then(async (response: Response) => {
            let duplicate = false;

            // ensure we have a "success" result
            if (response.status >= 200 && response.status < 300) {
              // Get The JSON response
              const workitems: any = await response.json();
              const filtered_workitems: Array<any> = workitems.value.filter(
                (workitem: any) => workitem.id !== currentWorkItemId
              );

              this._logger.debug('filtered_workitems', filtered_workitems);

              // first check for match title is fastest as shortest text

              filtered_workitems.every((workitem: any) => {
                const title_match: number = dice(
                  currentWorkItemTitle,
                  this.normalizeString(workitem.fields['System.Title'])
                );
                const description_match: number = dice(
                  currentWorkItemDescription,
                  this.normalizeString(workitem.fields['System.Description'])
                );

                this._logger.debug('title_match', title_match);
                this._logger.debug('description_match', description_match);

                if (title_match + description_match > 0) {
                  let match = 0;
                  // Let only include the results for relevant fields
                  if (includeTitle && includeDesciption) {
                    match = (title_match + description_match) / 2;
                  } else if (includeTitle) {
                    match = title_match;
                  } else {
                    match = description_match;
                  }

                  this._logger.debug('match', match);

                  if (match >= similarityIndex) {
                    this._logger.info(
                      `Matched work item (SimilarityIndex=${match}) with id ${workitem.id}.`
                    );
                    duplicate = true;
                    return false;
                  }
                }
                return true;
              });
            } else {
              this._logger.info('Failed to retrieve work item chunk.');
              this._logger.debug('response', response);
            }

            // resolve the promise
            resolve(duplicate);
          })
          .catch((error: Error) => {
            // Save this failure for later
            this._logger.error('Unhandled Error.', error);
            reject(error);
          });
      } catch (error) {
        // unhandled error
        reject(false);
        this._logger.error(error);
      }
    });
  }

  // function to get first promise which resolves to true result
  private async getfirstResolvedPromise(
    promises: Array<Promise<boolean>>
  ): Promise<boolean> {
    const newPromises: Promise<boolean>[] = promises.map(
      (p) =>
        new Promise<boolean>((resolve, reject) =>
          p.then((v) => v && resolve(true), reject)
        )
    );
    newPromises.push(Promise.all(promises).then(() => false));
    return Promise.race(newPromises);
  }

  // Called when the active work item is modified
  public async onFieldChanged(args: IWorkItemFieldChangedArgs) {
    this._logger.debug('WorkItemForm.onFieldChanged().');
    this._logger.debug('args', args);
    const changedFields = args.changedFields;

    const title: string = changedFields['System.Title'] as string;
    const description: string = changedFields['System.Description'] as string;

    if (title || description) {
      // when changes are made wait a bit before triggering the validation
      if (this._timeout) clearTimeout(this._timeout);
      this._logger.debug('Setting timer for triggering validation.');
      this._timeout = setTimeout(async () => {
        this._logger.debug('Triggering validation.');
        this.validateWorkItem(title, description);
      }, 2000);
    }
  }

  public async changedFields(args: IWorkItemChangedArgs) {
    this._logger.debug('WorkItemForm.changedFields().');
    this._logger.debug('args', args);
  }

  // Called when a new work item is being loaded in the UI
  public async onLoaded(args: IWorkItemLoadedArgs) {
    this._logger.debug('WorkItemForm.onLoaded().');
    this._logger.debug('args', args);

    const title: string = (await this._workItemFormService.getFieldValue(
      'System.Title',
      { returnOriginalValue: false }
    )) as string;
    const description: string = (await this._workItemFormService.getFieldValue(
      'System.Description',
      { returnOriginalValue: false }
    )) as string;

    if (title || description) {
      this.validateWorkItem(title, description);
    }
  }

  // Called when the work item is reset to its unmodified state (undo)
  public async onReset(args: IWorkItemChangedArgs) {
    this._logger.debug('WorkItemForm.onReset().');
    this._logger.debug('args', args);
  }

  // Called when the work item has been refreshed from the server
  public async onRefreshed(args: IWorkItemChangedArgs) {
    this._logger.debug('WorkItemForm.onRefreshed().');
    this._logger.debug('args', args);

    const title: string = (await this._workItemFormService.getFieldValue(
      'System.Title',
      { returnOriginalValue: false }
    )) as string;
    const description: string = (await this._workItemFormService.getFieldValue(
      'System.Description',
      { returnOriginalValue: false }
    )) as string;

    if (title || description) {
      this.validateWorkItem(title, description);
    }
  }

  // Called after the work item has been saved
  public async onSaved(args: IWorkItemChangedArgs) {
    this._logger.debug('WorkItemForm.onSaved().');
    this._logger.debug('args', args);
  }

  // Called when the active work item is being unloaded in the UI
  public async onUnloaded(args: IWorkItemChangedArgs) {
    this._logger.debug('WorkItemForm.onUnloaded().');
    this._logger.debug('args', args);
  }
}

export async function main(): Promise<void> {
  await SDK.init();

  // wait until we are ready
  await SDK.ready();

  SDK.register(SDK.getContributionId(), async () => {
    // Get The ADO Services which we will need later
    const locationService: ILocationService = await SDK.getService(
      CommonServiceIds.LocationService
    );
    const projectService: IProjectPageService =
      await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
    const workItemFormService: IWorkItemFormService =
      await SDK.getService<IWorkItemFormService>(
        WorkItemTrackingServiceIds.WorkItemFormService
      );
    const dataService: IExtensionDataService =
      await SDK.getService<IExtensionDataService>(
        CommonServiceIds.ExtensionDataService
      );

    // Get the observer
    return new duplicateObserver(
      workItemFormService,
      locationService,
      projectService,
      dataService
    );
  });
}

// execute our entrypoint
main().catch((error) => {
  console.error(error);
});
