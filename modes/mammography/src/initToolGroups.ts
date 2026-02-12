/**
 * Mammography tool groups initialization
 *
 * Re-exports the shared initToolGroups from mammography-shared.
 * Both mammography and mammography-compare use identical tool group configurations.
 */
export { initToolGroups as default } from '@ohif/mode-mammography-shared';
