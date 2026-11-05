/**
 * Loaded by evaluate.js --emulator: a Cloud Control read the emulator hasn't implemented (501 NotImplemented)
 * is reported the way Cloud Control reports an unsupported type, so the GetAtt is listed as unresolved instead of failing the stack.
 *
 * Requires TOOLKIT_LIB to be set (evaluate.js sets it).
 */
const path = require('path');
const TOOLKIT_LIB = process.env.TOOLKIT_LIB;
const { SharedLookups } = require(path.join(TOOLKIT_LIB, 'lib/api/cloudformation/shared-lookups'));

const resourceProperties = SharedLookups.prototype.resourceProperties;
SharedLookups.prototype.resourceProperties = async function (...args) {
  try {
    return await resourceProperties.apply(this, args);
  } catch (e) {
    if (e?.name === 'NotImplemented' || e?.__type === 'NotImplemented') {
      const err = new Error(`emulator: Cloud Control GetResource not implemented for ${args[2]}`);
      err.name = 'UnsupportedActionException';
      throw err;
    }
    throw e;
  }
};
