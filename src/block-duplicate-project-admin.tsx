import './block-duplicate-project-admin.scss';
import { Header } from 'azure-devops-ui/Header';
import { Page } from 'azure-devops-ui/Page';
import { Button } from 'azure-devops-ui/Button';
import { TextField } from 'azure-devops-ui/TextField';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as SDK from 'azure-devops-extension-sdk';
import Logger, { LogLevel } from './logger';
import {
  CommonServiceIds,
  IExtensionDataService,
  IExtensionDataManager,
} from 'azure-devops-extension-api';

interface IBlockDuplicatesAdminState {
  SimilarityIndex: string;
}

export default class BlockDuplicatesAdmin extends React.Component<
  {},
  IBlockDuplicatesAdminState
> {
  _logger: Logger = new Logger(LogLevel.Info);

  constructor(props: {}) {
    super(props);

    this.state = {
      SimilarityIndex: '',
    };

    this.onSaveClick = this.onSaveClick.bind(this);
  }

  public async componentDidMount(): Promise<void> {
    SDK.init();

    // wait until we are ready
    await SDK.ready();

    const dataService: IExtensionDataService =
      await SDK.getService<IExtensionDataService>(
        CommonServiceIds.ExtensionDataService
      );
    const dataManager: IExtensionDataManager =
      await dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );

    // Get current value for setting
    const similarityIndex: number = await dataManager.getValue<number>(
      'SimilarityIndex',
      {
        scopeType: 'Default',
      }
    );

    if (similarityIndex) {
      this.setState((prevState: IBlockDuplicatesAdminState) => {
        prevState.SimilarityIndex = similarityIndex
          ? similarityIndex.toString()
          : '0.8';
        return prevState;
      });
    }
  }

  public async onSaveClick(): Promise<void> {
    const config: IBlockDuplicatesAdminState = this.state;

    const similarityIndex = Number(config.SimilarityIndex);
    this._logger.debug(`Setting similarityIndex to ${similarityIndex}`);

    const dataService: IExtensionDataService =
      await SDK.getService<IExtensionDataService>(
        CommonServiceIds.ExtensionDataService
      );
    const dataManager: IExtensionDataManager =
      await dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        await SDK.getAccessToken()
      );
    // Get current value for setting
    await dataManager.setValue<number>('SimilarityIndex', similarityIndex, {
      scopeType: 'Default',
    });
  }

  public render(): JSX.Element {
    const config: IBlockDuplicatesAdminState = this.state;
    return (
      <div>
        <div>
          <h3>Similarity Index</h3>
          <p>
            <input
              type="text"
              onChange={(e) => {
                this.setState({
                  SimilarityIndex: e.target.value,
                });
              }}
              value={config.SimilarityIndex}
            />
          </p>
          <input
            type="button"
            value="Save"
            onClick={() => this.onSaveClick()}
          />
        </div>
      </div>
    );
  }
}

ReactDOM.render(<BlockDuplicatesAdmin />, document.getElementById('root'));
