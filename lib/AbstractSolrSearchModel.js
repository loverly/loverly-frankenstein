/*******************************************************************************
 *
 * AbstractSolrSearchModel.js
 *
 * Date:   April 2014
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractModel = require('./AbstractModel');

/**
 * Create a wrapper for the Solr search client that optimizes the way that lists
 * are generated.
 *
 * @class AbstractSolrSearchModel
 * @constructor
 * @extends AbstractModel
 */
var AbstractSolrSearchModel = function () {

};

AbstractSolrSearchModel.prototype = new AbstractModel();


/**
 * Override the list method to not call the count method before calling the list
 * function regardless of whether meta is included or not.  Solr returns the meta
 * with the list response so there is no need to make two requests.
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractSolrSearchModel.prototype.list = function (params, options, callback) {
  var i;
  var idMapping = this.definition[this.primaryKey].mapping;
  var idAlias = (idMapping && idMapping.alias) ? idMapping.alias : 'id';

  options = this.mergeViewOptions(options);

  options.limit = (options && options.limit) ? options.limit : 25;
  options.offset = (options && options.offset) ? options.offset : 0;
  options.sortField  = (options && options.sort_field) ? options.sort_field : idAlias;
  options.sortOrder = (options && options.sort_order) ? options.sort_order : 'ASC';
  options.randomSeed = (options && options.random_seed) ? options.random_seed : null;

  // Ensure proper sort order values
  if (options.sortOrder !== 'ASC' && options.sortOrder !== 'DESC') {
    options.sortOrder = 'ASC';
  }

  options.query = options.query || 'default';

  // Set the foreign key ID if this is a submodel
  if (this.isSource && !options.should_disable_foreign_key) {
    params[this.foreignKey] = params.parent_id;
    delete params.parent_id;
  }

  var sources = this.sources;
  var sourceInfo;
  var source;
  var query;

  for (i in sources) {
    sourceInfo = sources[i];
    source = sourceInfo.source;

    if (sourceInfo.is_primary) {
      // Create a query object per source based on the params and the named query
      // specified
      query = this.getQueryForSource(options.query, params, sourceInfo);
      source.list(query, options, this.generateListFromSourceCallback(source, {}, options, callback));
      break;
    }
  }
};

/**
 * Generate a callback with the
 *
 * @method method
 * @param
 * @returns
 * @private
 */
AbstractSolrSearchModel.prototype.generateListFromSourceCallback = function (source, meta, options, callback) {
  var self = this;
  meta = meta || {};

  return function (err, solrResponse) {
    var i;

    if (err) {
      callback(err);
      return;
    }

    var result = {list: null, meta: {}};

    for (i in meta) {
      result.meta[i] = meta[i];
    }

    // Also add the options to the metadata
    for (i in options) {
      result.meta[i] = options[i];
    }

    // Add the total count from the solr response
    result.meta.total = solrResponse.numfound;

    // Get the instances from the solr response
    var instances = solrResponse.docs;

    var list = [];
    var sourceInstance;
    var newInstance;

    for (i in instances) {
      sourceInstance = instances[i];
      newInstance = self.createInstance();
      newInstance.bindFromSourceInstance(source, sourceInstance);
      list.push(newInstance);
    }

    result.list = list;

    // Return only the list if the meta is not included
    if (!options.should_include_meta) {
      result = list;
    }

    callback(null, result);
  };
};

module.exports =  AbstractSolrSearchModel;