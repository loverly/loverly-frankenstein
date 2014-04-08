

/**
 * Constants defining the different types of mappings between sources.
 *
 * @class SOURCE_MAPPING_TYPES
 */
var SOURCE_MAPPING_TYPES = {};

/**
 * This source has a one-to-one relationship with the model.  This is a read/write
 * relationship.
 *
 * @property SOURCE_MAPPING_TYPES.ONE_TO_ONE
 * @type string
 */
SOURCE_MAPPING_TYPES.ONE_TO_ONE =  "one-to-one";

/**
 * This source has a one-to-one relationship with the model.  This is a read only
 * relationship.
 *
 * @property SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF
 * @type string
 */
SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF =  "one-to-one-ref";

/**
 * This source provides many records to the model.
 *
 * @property SOURCE_MAPPING_TYPES.ONE_TO_MANY
 * @type string
 */
SOURCE_MAPPING_TYPES.ONE_TO_MANY = "one-to-many";

/**
 * A search model to use when searching for a list of IDs given a set of parameters
 *
 * @property SOURCE_MAPPING_TYPES.SEARCH
 * @type string
 */
SOURCE_MAPPING_TYPES.SEARCH = "search";

module.exports = SOURCE_MAPPING_TYPES;