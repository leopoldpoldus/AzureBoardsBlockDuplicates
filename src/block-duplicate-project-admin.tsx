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
  IncludeTitle: boolean;
  IncludeDesciption: boolean;
  SameType: boolean;
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
      IncludeTitle: true,
      IncludeDesciption: true,
      SameType: true,
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

    const includeTitle: boolean = await dataManager.getValue<boolean>(
      'IncludeTitle',
      {
        scopeType: 'Default',
      }
    );

    if (includeTitle) {
      this.setState((prevState: IBlockDuplicatesAdminState) => {
        prevState.IncludeTitle = includeTitle;
        return prevState;
      });
    }

    const includeDesciption: boolean = await dataManager.getValue<boolean>(
      'IncludeDesciption',
      {
        scopeType: 'Default',
      }
    );

    if (includeDesciption) {
      this.setState((prevState: IBlockDuplicatesAdminState) => {
        prevState.IncludeDesciption = includeDesciption;
        return prevState;
      });
    }

    const sameType: boolean = await dataManager.getValue<boolean>('SameType', {
      scopeType: 'Default',
    });

    if (sameType) {
      this.setState((prevState: IBlockDuplicatesAdminState) => {
        prevState.SameType = sameType;
        return prevState;
      });
    }
  }

  public async onSaveClick(): Promise<void> {
    const config: IBlockDuplicatesAdminState = this.state;

    const similarityIndex = Number(config.SimilarityIndex);
    const includeTitle = config.IncludeTitle;
    const includeDesciption = config.IncludeDesciption;
    const sameType = config.SameType;
    this._logger.debug(`Setting similarityIndex to ${similarityIndex}`);
    this._logger.debug(`Setting includeTitle to ${includeTitle}`);
    this._logger.debug(`Setting includeDesciption to ${includeDesciption}`);
    this._logger.debug(`Setting sameType to ${sameType}`);

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
    await dataManager.setValue<boolean>('IncludeTitle', includeTitle, {
      scopeType: 'Default',
    });
    await dataManager.setValue<boolean>(
      'IncludeDesciption',
      includeDesciption,
      {
        scopeType: 'Default',
      }
    );
    await dataManager.setValue<boolean>('SameType', sameType, {
      scopeType: 'Default',
    });
  }

  public render(): JSX.Element {
    const config: IBlockDuplicatesAdminState = this.state;
    return (
      <div>
        <div>
          <h3>Block Duplicate Work Items</h3>
          <p>
            This extension provides the ability to block duplicate work item
            creation, similarity between work items is currently determined
            based on{' '}
            <a href="http://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient">
              Dice&apos;s Coefficient
            </a>
            .
          </p>
          <p>
            Checks are automatically performed on work items of{' '}
            <select
              value={config.SameType.toString()}
              onChange={(e) => {
                this.setState({
                  SameType: /true/i.test(e.target.value),
                });
              }}
            >
              <option value="true">the same type</option>
              <option value="false">all types</option>
            </select>{' '}
            and on the following fields :
            <ul className="hidebullets">
              <li>
                <input
                  type="checkbox"
                  checked={config.IncludeTitle}
                  onChange={(e) => {
                    this.setState({
                      IncludeTitle: e.target.checked,
                    });
                  }}
                />
                Title
              </li>
              <li>
                <input
                  type="checkbox"
                  checked={config.IncludeDesciption}
                  onChange={(e) => {
                    this.setState({
                      IncludeDesciption: e.target.checked,
                    });
                  }}
                />
                Description
              </li>
            </ul>
          </p>
          <p>
            As we are more intrested in the textual content before performing
            our similarity check we normalize our text:
            <ol>
              <li>Removing all HTML tags.</li>
              <li>
                Removing the following punctuation{' '}
                {'!"#$%&amp;\'()*+,-./:;?@[\\]^_`{|}~'}.
              </li>
              <li>Convert to lowercase.</li>
            </ol>
          </p>
          <p>
            Similarity is established based on an index 0.0 - 1.0 :
            <ul>
              <li>0.0 being least similar.</li>
              <li>1.0 being most similar.</li>
            </ul>
          </p>
          <p>
            Current Similarity Index threshold is:{' '}
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
          <p>
            This extension can be leveraged in combination with the{' '}
            <a href="https://marketplace.visualstudio.com/items?itemName=tschmiedlechner.find-similar-workitems">
              Find similar workitems
            </a>{' '}
            extension to establish which work items are similar to the current
            item.
          </p>
          <input
            type="button"
            value="Save"
            onClick={async () => await this.onSaveClick()}
          />
        </div>
      </div>
    );
  }
}

ReactDOM.render(<BlockDuplicatesAdmin />, document.getElementById('root'));
