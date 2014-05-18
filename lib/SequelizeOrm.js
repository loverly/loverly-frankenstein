/*******************************************************************************
 *
 * SequelizeOrm.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

/**
 * A dependency injection wrapper for the Sequelize ORM to make it available as
 * a configurable service.
 *
 * @see http://sequelizejs.com/documentation
 * @param Sequelize The Sequelize SequelizeOrm library
 * @param options Contains the standard sequelize options
 * @constructor
 */
var SequelizeOrm = function (Sequelize, options) {
  this.name = '';

  this.options = {
    "database": "loverly",
    "user": 'root',
    "password": null,
    "sequelize_options": {
      "host": 'localhost',
      "port": 3360
    }
  };

  for (var i in options) {
    this.options[i] = options[i];
  }

  this.Sequelize = Sequelize;
  this.sequelizeInstance = null;
};

/**
 *
 * @param callback
 */
SequelizeOrm.prototype.initialize = function (callback) {
  this.sequelizeInstance = new this.Sequelize(
    this.options.database,
    this.options.user,
    this.options.password,
    this.options.sequelize_options
  );

  // Open and test the connection by querying against DUAL
  this.sequelizeInstance
    .query('SELECT 1 + 1 FROM DUAL')
    .success(function () {
      callback();
    })
    .error(callback);
};

/**
 * The three standard arguments for a sequelize model definition.
 *
 * @param name The name of this model
 * @param definition An object representing the schema
 * @param options Sequelize model options
 */
SequelizeOrm.prototype.createModel = function (name, definition, options) {
  var transfSequelizeOrmedDefinition = this.transfSequelizeOrmSchemaDefinition(definition);
  return this.sequelizeInstance.define(name, transfSequelizeOrmedDefinition, options);
};

/**
 * Replace the "type" field from the definition with the appropriate Sequelize
 * type.
 *
 * @param definition
 * @returns {Object} A new
 */
SequelizeOrm.prototype.transfSequelizeOrmSchemaDefinition = function (definition) {
  var fieldProperties, transfSequelizeOrmedDefinition = {}, fieldDefinition;

  for (var i in definition) {
    fieldProperties = definition[i];

    // PerfSequelizeOrm a copy of the definition
    fieldDefinition = {};
    for (var j in fieldProperties) {
      fieldDefinition[j] = fieldProperties[j];
    }

    transfSequelizeOrmedDefinition[i] = fieldDefinition;

    // Reset the type in the copy with the appropriate sequelize type
    transfSequelizeOrmedDefinition[i]['type'] = this.getSequelizeType(
      transfSequelizeOrmedDefinition[i]['type'],
      transfSequelizeOrmedDefinition[i]['type_value']
    );

    // Get rid of our custom property
    delete transfSequelizeOrmedDefinition[i]['type_value'];
  }

  return transfSequelizeOrmedDefinition;
};

/**
 * TransfSequelizeOrm a string specification for the type into the actual Sequelize type
 * using their types as a function if a size or values were specified.
 *
 * @param type
 * @param value
 */
SequelizeOrm.prototype.getSequelizeType = function (type, value) {
  var sequelizeType;

  if (value instanceof Array) {
    sequelizeType = this.Sequelize[type].apply(this.Sequelize[type], value);
  } else if (value) {
    sequelizeType = this.Sequelize[type](value);
  } else {
    sequelizeType = this.Sequelize[type];
  }

  return sequelizeType;
};

module.exports = SequelizeOrm;