// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS } from '../src/config.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { APPROACH_MINUTES, DELAY_MINUTES, TRIGGERS } from '../src/service.js';
import { WIDGETS } from '../src/widgets.js';
import { action, create, createWorld } from './helpers/world.js';
import { stageEverything } from './helpers/scenario.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (entry) => entry.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('identity: name, image, cover, cloud transport, transport category, countries', () => {
  assert.equal(manifest.name, 'Amtrak');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-amtrak:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-amtrak/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['transport']);
  assert.deepEqual(manifest.countries, ['US', 'CA']);
});

test('Gladys 5.3.0 at least: countries and keywords (widgets and scenes need 5.1.0)', () => {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  const [major, minor] = match.slice(1).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), manifest.gladys_version);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), handlerKeys('action:').sort());
});

test('every scene action has a handler, and its outputs are the declared ones', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(handlerKeys('sceneAction:').sort(), keysOf(manifest.scene_actions).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await action(world, 'add_train', { train: '2151' });
  await action(world, 'add_station', { station: 'CHI' });
  const devices = [
    await create(world, 'Zephyr'),
    await create(world, 'Amtrak 2151'),
    await create(world, 'Chicago Union'),
  ];
  const [entry] = manifest.scene_actions;
  for (const device of devices) {
    const result = await world.fake.sceneAction(entry.key, { train: device.external_id });
    assert.equal(result.success, true, device.name);
    assert.deepEqual(
      Object.keys(result.data.outputs).sort(),
      keysOf(entry.outputs).sort(),
      `${device.name} outputs`,
    );
    // "Continue only if" compares with ===: numbers, never booleans.
    for (const output of entry.outputs) {
      assert.notEqual(output.type, 'boolean', output.key);
      assert.equal(typeof result.data.outputs[output.key], output.type, output.key);
    }
  }
});

test('the scene triggers fired by the code are declared, with their thresholds', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const soon = field(manifest.scene_triggers, TRIGGERS.APPROACHING);
  assert.deepEqual(optionValues(field(soon.fields, 'threshold')), APPROACH_MINUTES.map(String));
  const delayed = field(manifest.scene_triggers, TRIGGERS.DELAYED);
  assert.deepEqual(optionValues(field(delayed.fields, 'threshold')), DELAY_MINUTES.map(String));
  // An event per threshold reached: without a value, every one would match.
  for (const trigger of [soon, delayed]) {
    assert.equal(field(trigger.fields, 'threshold').required, true);
  }
});

test('the event data of every trigger carries its declared fields and variables', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { events } = await stageEverything(world);
  for (const trigger of manifest.scene_triggers) {
    const fired = events.filter((event) => event.key === trigger.key);
    assert.ok(fired.length > 0, `${trigger.key} fired`);
    for (const event of fired) {
      for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
        assert.ok(key in event.data, `${trigger.key}: "${key}" is in the event data`);
      }
      for (const variable of trigger.variables) {
        assert.equal(
          typeof event.data[variable.key],
          variable.type,
          `${trigger.key}.${variable.key}`,
        );
      }
    }
  }
});

test('every widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  assert.deepEqual(handlerKeys('widget:').sort(), Object.keys(WIDGETS).sort());
});

test('config_schema defaults and options are the ones of the code', () => {
  for (const entry of manifest.config_schema) {
    if (entry.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[entry.key], entry.default, entry.key);
    }
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((entry) => entry.type !== 'section')
      .map((entry) => entry.key)
      .sort(),
  );
  assert.deepEqual(optionValues(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.deepEqual(
    optionValues(field(manifest.config_schema, 'refresh_interval')),
    REFRESH_INTERVALS.map(String),
  );
});

test('section fields are purely presentational, with https links', () => {
  for (const section of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((entry) => entry.source !== undefined);
  assert.ok(dynamic.length >= 5);
  for (const entry of dynamic) {
    assert.equal(entry.source, 'devices');
    assert.equal(entry.options, undefined, entry.key);
  }
});

test('actions: no secret field, no default (the core applies none to actions)', () => {
  // GladysAssistant/Gladys#3154 and #3155.
  for (const entry of manifest.actions) {
    for (const item of entry.fields ?? []) {
      assert.notEqual(item.type, 'secret', `${entry.key}.${item.key}`);
      assert.equal(item.default, undefined, `${entry.key}.${item.key}`);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
