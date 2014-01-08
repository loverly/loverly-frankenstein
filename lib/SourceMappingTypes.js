

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
 * This source provides many records to the model.
 *
 * @property SOURCE_MAPPING_TYPES.ONE_TO_MANY
 * @type string
 */
SOURCE_MAPPING_TYPES.ONE_TO_MANY = "one-to-many";

module.exports = SOURCE_MAPPING_TYPES;