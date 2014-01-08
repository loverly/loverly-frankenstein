

/**
 * Constants defining the different types of field mappings from model to 
 * source.
 *
 * @class FIELD_MAPPING_TYPES
 */
 var FIELD_MAPPING_TYPES = {};

/**
 * A field from a relational database table
 *
 * @property FIELD_MAPPING_TYPES.DB_FIELD
 * @type string
 */
FIELD_MAPPING_TYPES.DB_FIELD =  "db_field";



/**
 * A field from an AbstractSource
 *
 * @property FIELD_MAPPING_TYPES.FIELD
 * @type string
 */
FIELD_MAPPING_TYPES.FIELD =  "field";

/**
 * A calculated or derived field.
 *
 * @property FIELD_MAPPING_TYPES.VIRTUAL_FIELD
 * @type string
 */
FIELD_MAPPING_TYPES.VIRTUAL_FIELD = "virtual_field";

/**
 * A one-to-one mapping of fields from one model to another. The property is an
 * instance of that model.
 *
 * TODO: Not sure what we'll use this for yet.
 * 
 * @property FIELD_MAPPING_TYPES.SUBMODEL_PROPERTY
 * @type string
 */
FIELD_MAPPING_TYPES.SUBMODEL_PROPERTY = "submodel_property";

/**
 * A one-to-many relationship between this model and another sub-model.
 *
 * @property FIELD_MAPPING_TYPES.SUBMODEL_ARRAY
 * @type string
 */
FIELD_MAPPING_TYPES.SUBMODEL_ARRAY =  "submodel_array";

/**
 * A reference by ID to another model.  This is a one-way reference and cannot
 * update the other model, unlike a submodel property which is a bi-directional
 * link.
 *
 * @property FIELD_MAPPING_TYPES.MODEL_REFERENCE
 * @type string
 */
FIELD_MAPPING_TYPES.MODEL_REFERENCE = "model_reference";

/**
 * A property that belongs to an API object.  Not sure what we'll do with this
 * yet.
 *
 * @property FIELD_MAPPING_TYPES.API_OBJECT
 * @type string
 */
FIELD_MAPPING_TYPES.API_OBJECT = "api_object";

module.exports = FIELD_MAPPING_TYPES;