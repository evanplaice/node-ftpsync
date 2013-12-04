// Design Notes
// ----------------------------------------------------------------------------
// TODO:
// - prepare for export
// - add directory creatin
// - add delete() function
// - add directory removal
// - add verify() function
// - add touch() function
// - finish implementing timeSync()
// - fix time comparison on isModified

// Setup
// ----------------------------------------------------------------------------
var fs = require('fs');
var path = require('path');
var jsftp = require('jsftp');
var async = require('async');
var config = require(process.cwd() + '/config.json');

var settings;
var ftp;

// helper functions
// ----------------------------------------------------------------------------

// maps a file lookup table from an array of file objects
function lookupTable(array) {
  //if (!array) { return []; }
  var lookup = [];
  for (var i = 0, len = array.length; i < len; i++) {
    lookup[i] = array[i].id;
  }
  return lookup;
}

// compare local vs remote file sizes
function isDifferent(lfile, rfile) {
  return (lfile.size != rfile.size);
}

// compare a local vs remote file for modification 
function isModified(lfile, rfile) {
  // round to the nearest minute
  //var minutes = 1000 * 60;
  //var hours = 1000 * 60 * 60;
  //var ltime = new Date(((Math.round(ltime / minutes) * minutes) - (ltimeOffset * hours)));
  //var rtime = new Date(((Math.round(rtime / minutes) * minutes) - (rtimeOffset * hours)));
  //var ltime = new Date(Math.round(ltime / minutes) * minutes);
  //var rtime = new Date(Math.round(rtime / minutes) * minutes);
  //console.log('Compare:');
  //console.log('lTime: ' + ltime);
  //console.log('rTime: ' + rtime);
}

// synchronizes the local and remote clocks
function syncTime(ltime, rtime) {
  // get the current date/time
  var now = new Date();
  // calculate the local time offset
  var ltimeOffset = (now.getTimezoneOffset() / 60);
  // round to the nearest hour
  var coeff = 1000 * 60 * 60;
  // greenwich mean time
  var gmtime = new Date((Math.round(ltime / coeff) - ltimeOffset) * coeff);
  // local time
  var ltime = new Date(Math.round(ltime / coeff) * coeff);
  // remote time
  var rtime = new Date(Math.round(rtime / coeff) * coeff);
  // calculate the remote time offset
  var rtimeOffset = (rtime - ltime) / coeff;
  console.log('Offsets:');
  console.log('loffset: +' + ltimeOffset);
  console.log('roffset: +' + rtimeOffset);
}

// trims the base dir of from the file path
function trimPathRoot(root, path) {
  var rdirs = root.split('/');
  var fdirs = path.split('/');
  return '/' + fdirs.splice((rdirs.length), (fdirs.length-rdirs.length)).join('/');
}

var sync = exports = {
  settings: {
    'host': config.host,
    'port': config.port || 21,
    'user': config.user,
    'pass': config.pass,
    'local': config.local || process.cwd(),
    'remote': config.remote || '/',
    'ignore': config.ignore || {},
    'maxConnections': 1,
    'ltimeOffset': 0,
    'rtimeOffset': 0
  },

  local: [],
  remote: [],
  add: [],
  update: [],
  remove: [],

  setup: function(callback) {
    settings = exports.settings;
    console.log('Setup');
    console.log('-------------------------------------------------------------');
    console.log('Settings:');
    console.dir(settings);
    ftp = new jsftp({
      host: settings.host,
      port: settings.port,
      user: settings.user,
      pass: settings.pass
    });
    console.log('- FTP client started')
    console.log();

    callback(null, 'setup complete');
  },

  collect: function(callback) {
    console.log('Collecting');
    console.log('-------------------------------------------------------------');
    async.series([
      function(callback) {
        utils.walkLocal(settings.local, callback);
      },
      function(callback) {
        utils.walkRemote(settings.remote, callback);
      }
    ], function(err, results) {
      sync.local = results[0];
      sync.remote = results[1];
      // log the results
      console.log('Local Files:');
      console.dir(sync.local);
      console.log();
      console.log('Remote Files:');
      console.dir(sync.remote);
      console.log();

      callback(null, 'collection complete');
    });
  },

  consolidate: function(callback) {
    console.log('Consolidating');
    console.log('-------------------------------------------------------------');
    // create lookup tebles for easy comparison
    var rFiles = lookupTable(sync.remote);
    var lFiles = lookupTable(sync.local);
    // run the comparison
    rFiles.forEach(function(file) {
      var lIDX = lFiles.indexOf(file);
      if (lIDX != -1) {
        var rIDX = rFiles.indexOf(file);
        var lFile = sync.local[lIDX];
        var rFile = sync.remote[rIDX];
        if (isDifferent(sync.local[lIDX], sync.remote[rIDX])) {
          sync.update.push(file);
        }
        // mark matches for removal
        lFiles[lIDX] = '';
        rFiles[rIDX] = '';
      }
    });
    // remove matches from local and remote tables
    rFiles.forEach(function(file) {
      if(file === '') { return; }
      sync.remove.push(file);
    });
    lFiles.forEach(function(file) {
      if(file === '') { return; }
      sync.add.push(file);
    });

    // log the results
    console.log('Updates:');
    console.dir(sync.update);
    console.log('Add:');
    console.dir(sync.add);
    console.log('Remove:');
    console.dir(sync.remove);
    console.log();

    callback(null, 'consolidation complete');
  },

  commit: function(callback) {
    console.log('Committing');
    console.log('-------------------------------------------------------------');
    async.series([
      function(callback) {
        if (sync.add.length == 0) { callback(null, 'no additions'); return; }
        async.mapLimit(sync.add, settings.maxConnections, utils.upload, function (err) {
          if (err) {
            callback(err, 'additions failed');
          }
          else {
            callback(null, 'additions complete');
          }
        });
      },
      function(callback) {
        if (sync.update.length == 0) { callback(null, 'no updates'); return; }
        async.mapLimit(sync.update, settings.maxConnections, utils.upload, function (err) {
          if (err) {
            callback(err, 'updates failed');
          }
          else {
            callback(null, 'updates complete');
          }
        });
      },
      function(callback) {
        if (sync.remove.length == 0) { callback(null, 'no removals'); return; }
        // TODO: add stuff here
        callback(null, 'removals complete');
      }
    ],
    function(err, results) {
      // log the results
      console.log(results);
      callback(null, 'commit complete');
    });
  },

  run: function(callback) {
    async.series([
      function(callback) {
        sync.setup(callback);
      },
      function(callback) {
        sync.collect(callback);
      },
      function(callback) {
        sync.consolidate(callback);
      },
      function(callback) {
        sync.commit(callback);
      }
    ],
    function(err, results) {
      if (err) {
        if (callback) {
          callback(err);
        }
        else {
          console.error(err);
          process.exit(code=1);
        }
      }
      else {
        if (callback) {
          callback(null);
        }
        else {
          console.log(results);
          process.exit(code=0)
        }
      }
    });
  }
};

var utils = exports.utils = {
  walkLocal: function(dir, callback) {
    var results = [];
    // walk the directory
    fs.readdir(dir, function(err, list) {
      if (err) return callback(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        // exit if all files are processed
        if (!file) return callback(null, results);
        // skip ignore files
        if (settings.ignore.indexOf(file) != -1) {
          next();
          return;
        }
        // get file/dir name/stats
        var path = dir + '/' + file;
        fs.stat(path, function(err, stat) {
          // handle directories
          if (stat.isDirectory()) {
            utils.walkLocal(path, function(err, res) { // recurse & shit
              results = results.concat(res);
              next();
            });
            return;
          }
          // handle files
          if (stat.isFile()) {
            results.push({
              'id':trimPathRoot(settings.local, path),
              'size':stat.size,
              'time':new Date(stat.ctime)
            });
            next();
            return;
          }
          // skip everything else
          else { next(); }
        });
      })();
    });
  },

  walkRemote: function(dir, callback) {
    var results = [];
    // walk the directory
    ftp.ls(dir, function(err, list) {
      if (err) return callback(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        // exit if all files are processed
        if (!file) return callback(null, results);
        // skip ignore files
        if (settings.ignore.indexOf(file.name) != -1) {
          next();
          return;
        }
        // get file/dir name/stats
        var path = dir + '/' + file.name;
        // handle directories
        if (file.type == 1) {
          utils.walkRemote(path, function(err, res) { // recurse & shit
            results = results.concat(res);
            next();
          });
          return;
        }
        // handle files
        if (file.type = 2) {
          results.push({
            'id':trimPathRoot(settings.remote, path),
            'size':+file.size,
            'time':new Date(file.time)
          });
          next();
          return;
        }
        // skip everything else (ex sumlinks)
        else { next(); }
      })();
    });
  },

  // upload a file to the remote server
  upload: function(file, callback) {
    var local = settings.local + file;
    var remote = settings.remote + file;
    fs.readFile(local, function(err, buffer) {
      if(err) {
        console.error(err);
        callback(err);
      }
      else {
        ftp.put(buffer, remote, function(err) {
          if (err) {
            console.error(err);
            callback(err);
          }
          else {
            console.log(file + " - uploaded successfuly");
            callback();
          }
        });
      }
    });
  },

  remove: function(file, callback) {
    return;
  }
}

var helpers = {
}
module.exports = exports;