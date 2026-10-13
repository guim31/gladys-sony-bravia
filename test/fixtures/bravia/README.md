# Bravia API fixtures

Answers of the Sony Bravia REST API, used by the fake TV of the tests
(`test/helpers/fakeBravia.js`). Serial numbers, MAC addresses and IP
addresses are invented (documentation ranges).

| File                                    | Source                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `system-information.json`               | Sony documentation, `system.getSystemInformation` example                              |
| `system-information-consumer.json`      | pybravia `tests/fixtures/system_info.json` (consumer TV with `cid`)                    |
| `system-information-no-serial.json`     | a TV without serial number (field documented as optional)                              |
| `power-*.json`                          | Sony documentation, `system.getPowerStatus`                                            |
| `volume.json`                           | Sony documentation, `audio.getVolumeInformation` example                               |
| `playing-hdmi.json`                     | Sony documentation, `avContent.getPlayingContentInfo` example                          |
| `playing-tv.json`                       | the fields pybravia and Home Assistant read for a channel (`dispNum`, `programTitle`…) |
| `error-*.json`                          | Sony documentation, error code list                                                    |
| `inputs-sony-doc.json`                  | Sony documentation, `avContent.getCurrentExternalInputsStatus` v1.0 example            |
| `inputs.json`                           | the inputs of Home Assistant's `braviatv` tests, with the documented fields            |
| `apps.json`                             | Sony documentation, `appControl.getApplicationList` example, plus common applications  |
| `remote-controller-info.json`           | Sony documentation, `system.getRemoteControllerInfo` appendix                          |
| `source-list.json`, `content-list.json` | the fields pybravia reads (`getSourceList`, `getContentList`)                          |
