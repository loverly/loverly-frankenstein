

/**
 * Defines the various field types allowed for model definitions.
 *
 * @class TYPES
 */
var TYPES = {};

/**
 * A string
 *
 * @property TYPES.STRING
 * @type string
 */
TYPES.STRING =  "STRING";


/**
 * An integer
 *
 * @property TYPES.INTEGER
 * @type string
 */
TYPES.INTEGER =  "INTEGER";


/**
 * A date
 *
 * @property TYPES.DATE
 * @type string
 */
TYPES.DATE =  "DATE";


/**
 * A boolean
 *
 * @property TYPES.BOOLEAN
 * @type string
 */
TYPES.BOOLEAN =  "BOOLEAN";


/**
 * An array of submodels
 *
 * @property TYPES.ARRAY
 * @type string
 */
TYPES.ARRAY =  "ARRAY";

/**
 * A field composed of data from other fields that is not persisted.
 *
 * @property TYPES.VIRTUAL
 * @type string
 */
TYPES.VIRTUAL =  "VIRTUAL";

/**
 * A datetime. The timestamp is in a format recognized by Moment.js
 *
 */
TYPES.DATETIME = "DATETIME";
TYPES.DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

module.exports = TYPES;