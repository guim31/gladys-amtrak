// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the service, so index.js stays a few lines and the tests drive
// the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { INIT_FAILED } from './messages.js';
import { SCENE_ACTIONS } from './scenes.js';
import { AmtrakService } from './service.js';
import { Store } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'amtrak-app' });

// A configuration action displays what it resolves, in the user's language,
// while a thrown error shows a single string: the expected failures (nothing
// found, Amtraker down) are answered, not thrown.
const answered =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err.messages) {
        return err.messages;
      }
      throw err;
    }
  };

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, now, timers, dataDir
 */
export function registerHandlers(gladys, options = {}) {
  const service = new AmtrakService({
    gladys,
    store: options.store ?? new Store(options.dataDir),
    fetch: options.fetch,
    now: options.now,
    timers: options.timers ?? true,
  });

  // Resolved once the service has started; every handler waits for it, so a
  // request arriving during the start is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): publish everything again.
        await service.resync(config);
        return;
      }
      started = true;
      await service.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  // Devices are published with should_poll: false (refreshed by the service's
  // own timer); this only serves a Gladys that would poll anyway.
  gladys.onPoll(whenReady(() => service.poll()));

  gladys.onScanRequest(whenReady(() => service.publishDiscovered()));

  gladys.onDeviceCreated(whenReady((device) => service.onDeviceCreated(device)));

  // The widget shows the name given in Gladys: renamed or deleted, it reloads.
  const refreshWidget = () => gladys.requestWidgetRefresh?.('train');
  gladys.onDeviceUpdated(whenReady(refreshWidget));
  gladys.onDeviceDeleted(whenReady(refreshWidget));

  gladys.onConfigUpdated(whenReady((newConfig) => service.reconfigure(normalizeConfig(newConfig))));

  const actions = {
    add_train: (fields) => service.addTrain(fields),
    add_station: (fields) => service.addStation(fields),
    find_station: (fields) => service.findStation(fields),
    remove: (fields) => service.remove(fields),
    status: () => service.status(),
  };
  for (const [key, handler] of Object.entries(actions)) {
    gladys.onAction(key, whenReady(answered(handler)));
  }

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(service, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(service, request)),
    );
  }

  return {
    service,
    ready,
    actions: Object.keys(actions),
    stop: () => service.stop(),
  };
}
