// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { Kernel, ServerConnection, SessionManager } from '@jupyterlab/services';
import { inject, injectable } from 'inversify';
import { CancellationToken } from 'vscode-jsonrpc';

import { IConfigurationService } from '../../common/types';
import { IConnection, IJupyterKernelSpec, IJupyterPasswordConnect, IJupyterSession, IJupyterSessionManager } from '../types';
import { JupyterKernelSpec } from './jupyterKernelSpec';
import { JupyterSession } from './jupyterSession';

@injectable()
export class JupyterSessionManager implements IJupyterSessionManager {
    constructor(
        @inject(IJupyterPasswordConnect) private jupyterPasswordConnect: IJupyterPasswordConnect,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService
    ) { }

    public async startNew(connInfo: IConnection, kernelSpec: IJupyterKernelSpec | undefined, cancelToken?: CancellationToken): Promise<IJupyterSession> {
        // Create a new session and attempt to connect to it
        const settings = this.configurationService.getSettings();
        const allowShutdown = settings.datascience.jupyterServerAllowKernelShutdown;
        const kernelId = settings.datascience.jupyterServerKernelId;
        const session = new JupyterSession(connInfo, kernelSpec, this.jupyterPasswordConnect, kernelId, allowShutdown);
        try {
            await session.connect(cancelToken);
        } finally {
            if (!session.isConnected) {
                await session.dispose();
            }
        }
        return session;
    }

    public getActiveKernels(connection: IConnection): Promise<Kernel.IModel[]> {
        return Kernel.listRunning(this.makeServerSettings(connection));
    }

    public async getActiveKernelSpecs(connection: IConnection): Promise<IJupyterKernelSpec[]> {
        let sessionManager: SessionManager | undefined;
        try {
            // Use our connection to create a session manager
            const serverSettings = this.makeServerSettings(connection);
            sessionManager = new SessionManager({ serverSettings: serverSettings });

            // Ask the session manager to refresh its list of kernel specs.
            await sessionManager.refreshSpecs();

            // Enumerate all of the kernel specs, turning each into a JupyterKernelSpec
            const kernelspecs = sessionManager.specs && sessionManager.specs.kernelspecs ? sessionManager.specs.kernelspecs : {};
            const keys = Object.keys(kernelspecs);
            return keys.map(k => {
                const spec = kernelspecs[k];
                return new JupyterKernelSpec(spec) as IJupyterKernelSpec;
            });
        } catch {
            // For some reason this is failing. Just return nothing
            return [];
        } finally {
            // Cleanup the session manager as we don't need it anymore
            if (sessionManager) {
                sessionManager.dispose();
            }
        }

    }

    private makeServerSettings(connection: IConnection): ServerConnection.ISettings {
        return ServerConnection.makeSettings(
            {
                baseUrl: connection.baseUrl,
                token: connection.token,
                pageUrl: '',
                // A web socket is required to allow token authentication (what if there is no token authentication?)
                wsUrl: connection.baseUrl.replace('http', 'ws'),
                init: { cache: 'no-store', credentials: 'same-origin' }
            });
    }

}
