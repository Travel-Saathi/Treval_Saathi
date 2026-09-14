/**
 * Backward-compatibility shim.
 *
 * Bus-specific processing now lives in busService.js. This module is kept so
 * any existing `require("./services/busSearchService")` keeps resolving to the
 * exact same implementation.
 */
module.exports = require("./busService");