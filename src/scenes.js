// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// The features already cover "turn on", "set the volume", "choose an input
// in the list". These actions take what a scene author types instead: an
// application or an input by name ("Netflix", "HDMI 2", the label set on the
// TV), and any key of the remote. They turn the TV on first when needed, and
// return what they did for the next actions of the scene. Gladys applies the
// field defaults to scene actions.
// -----------------------------------------------------------------------------

import { inputName } from './bravia/model.js';

export const SCENE_ACTIONS = {
  async open_app(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const app = await hub.openApp(record, String(fields.app ?? ''));
    return { app: app ? app.title : '' };
  },

  async select_input(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const input = await hub.selectInput(record, String(fields.input ?? ''));
    return { input: input ? inputName(input) : '' };
  },

  async send_key(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const presses = await hub.sendKey(record, String(fields.key ?? ''), fields.repeat ?? 1);
    return { presses };
  },
};
