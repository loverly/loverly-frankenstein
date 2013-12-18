/*******************************************************************************
 *
 * RackspaceFilesApi.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

/**
 * A wrapper to access the rackspace file api for image/other file uploads.
 *
 * @constructor
 */
var RackspaceFilesApi = function (options, pkgcloud, fs) {
  options = options || {};

  this.name = 'RackspaceFiles';

  // Rackspace API
  this.pkgcloud = pkgcloud;

  // Node fs library
  this.fs = fs;

  // An initialized client
  this.client = null;

  this.options = {
    "container": "dev",
    "username": "brandon.eum",
    "api_key": "e005fba5f5dd48668ef1a91a0b80dcbd",
    "region": "ORD"
  };

  for (var i in this.options) {
    this.options[i] = (options && options[i]) ? options[i] : this.options[i];
  }
};

/**
 * Create the rackspace client with the appropriate credentials
 *
 */
RackspaceFilesApi.prototype.initialize = function () {
  this.client = this.pkgcloud.storage.createClient({
    provider: 'rackspace',
    username: this.options.username,
    apiKey: this.options.api_key,
    region: this.options.region
  });
};

/**
 *
 * @param data
 * @param callback
 */
RackspaceFilesApi.prototype.create = function (data, callback) {
  var options = {
    container: this.options.container,
    remote: data.filename,
    local: data.tmpFile,
    metadata: {
      wedding_id: data.wedding_id
    },
    headers: {
      'content-type': data.content_type
    }
  };

  this.client.upload(options, callback);
};

/**
 *
 */
RackspaceFilesApi.prototype.read = function () {
  throw new Error('Not yet implemented');
};

/**
 * I can't imagine why we would need to update files.
 *
 */
RackspaceFilesApi.prototype.update = function () {
  throw new Error('Not available for Rackspace Files.');
};

/**
 *
 */
RackspaceFilesApi.prototype['delete'] = function () {
  throw new Error('Not yet implemented');
};


module.exports = RackspaceFilesApi;