import './block-duplicate-project-admin.scss';
import { Header, TitleSize } from 'azure-devops-ui/Header';
import { Page } from 'azure-devops-ui/Page';
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
  SimilarityIndex: number;
}

class BlockDuplicatesAdmin extends React.Component<
  {},
  IBlockDuplicatesAdminState
> {
  _logger: Logger = new Logger(LogLevel.Info);

  constructor(props: {}) {
    super(props);

    this.state = {
      SimilarityIndex: 0.8,
    };
  }

  public async componentDidMount() {
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
      this.setState({ SimilarityIndex: similarityIndex });
    }
  }

  public render(): JSX.Element {
    return (
      <div>
        <h3>Similarity Index</h3>
        <p>
          <strong>{this.state.SimilarityIndex}</strong>
        </p>
      </div>
    );
  }
}

ReactDOM.render(<BlockDuplicatesAdmin />, document.getElementById('root'));
