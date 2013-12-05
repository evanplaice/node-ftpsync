// Design Notes
// ----------------------------------------------------------------------------
// TODO:
// - add try/catch logic to sync.setup()
// - add directory creation
// - add delete() function
// - add directory removal
// - add verify() function
// - add touch() function
// - finish implementing timeSync()
// - fix time comparison on isModified
// - improve error handling

// Setup
// ----------------------------------------------------------------------------
var fs = require('fs');
var path = require('path');
var jsftp = require('jsftp');
var async = require('async');
var config = require(process.cwd() + '/config.json');

var settings;
var ftp;

var sync = exports = {
  settings: {
    'host': config.host,
    'port': config.port || 21,
    'user': config.user,
    'pass': config.pass,
    'local': config.local || process.cwd(),
    'remote': config.remote || '/',
    'ignore': config.ignore || {},
    'connections': 1,
    'ltimeOffset': 0,
    'rtimeOffset': 0
  },

  local: [],
  remote: [],
  mkdir: [],
  rmdir: [],
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
    // prepare the directory lists for comparison
    var rdirs = sync.remote.dirs;
    var ldirs = sync.local.dirs;
    // prepare the files lists for comparison
    var rFiles = helpers.lookupTable(sync.remote.files);
    var lFiles = helpers.lookupTable(sync.local.files);
    // compare directories for modifications
    rdirs.forEach(function(dir) {
      // if a match is found
      var lIDX = ldirs.indexOf(dir);
      if(lIDX != -1) {
        var rIDX = rdirs.indexOf(dir);
        ldirs[lIDX] = '';
        rdirs[rIDX] = '';
      }
    });
    // compare files for modifications
    rFiles.forEach(function(file) {
      var lIDX = lFiles.indexOf(file);
      // if a match is found
      if (lIDX != -1) {
        var rIDX = rFiles.indexOf(file);
        var lFile = sync.local.files[lIDX];
        var rFile = sync.remote.files[rIDX];
        if (helpers.isDifferent(sync.local.files[lIDX], sync.remote.files[rIDX])) {
          sync.update.push(file);
        }
        // mark updates as processed
        lFiles[lIDX] = '';
        rFiles[rIDX] = '';
      }
    });
    // process the rest
    ldirs.forEach(function(dir) {
      if(dir === '') { return; }
      sync.mkdir.push(dir);
    });
    rdirs.forEach(function(dir) {
      if(dir === '') { return; }
      sync.rmdir.push(dir);
    });
    lFiles.forEach(function(file) {
      if(file === '') { return; }
      sync.add.push(file);
    });
    rFiles.forEach(function(file) {
      if(file === '') { return; }
      sync.remove.push(file);
    });

    // log the results
    console.log('Mkdir:');
    console.dir(sync.mkdir);
    console.log('Rmdir:');
    console.dir(sync.rmdir);
    console.log('Add:');
    console.dir(sync.add);
    console.log('Updates:');
    console.dir(sync.update);
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
        if (sync.mkdir.length == 0) { callback(null, 'no mkdirs'); return; }
        // TODO: add stuff here
        callback(null, 'mkdirs complete');
      },
      function(callback) {
        if (sync.add.length == 0) { callback(null, 'no additions'); return; }
        async.mapLimit(sync.add, settings.connections, utils.upload, function (err) {
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
        async.mapLimit(sync.update, settings.connections, utils.upload, function (err) {
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
    var dirs = [];
    var files = [];
    // walk the directory
    fs.readdir(dir, function(err, list) {
      if (err) return callback(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        // exit if all files are processed
        if (!file) return callback(null, { 'dirs':dirs,'files':files });
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
            // add the directory to the results
            dirs.push(helpers.trimPathRoot(settings.local, path));
            // concat results from recursive calls
            utils.walkLocal(path, function(err, res) { // recurse & shit
              dirs = dirs.concat(res.dirs);
              files = files.concat(res.files);
              next();
            });
            return;
          }
          // handle files
          if (stat.isFile()) {
            files.push({
              'id':helpers.trimPathRoot(settings.local, path),
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
    var dirs = [];
    var files = [];
    // walk the directory
    ftp.ls(dir, function(err, list) {
      if (err) return callback(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        // exit if all files are processed
        if (!file) return callback(null, { 'dirs':dirs, 'files':files });
        // skip ignore files
        if (settings.ignore.indexOf(file.name) != -1) {
          next();
          return;
        }
        // get file/dir name/stats
        var path = dir + '/' + file.name;
        // handle directories
        if (file.type == 1) {
          // add the directory to the results
          dirs.push(helpers.trimPathRoot(settings.remote, path));
          // concat results from recursive calls
          utils.walkRemote(path, function(err, res) { // recurse & shit
            dirs = dirs.concat(res.dirs);
            files = files.concat(res.files);
            next();
          });
          return;
        }
        // handle files
        if (file.type = 2) {
          // add the file to the results
          files.push({
            'id':helpers.trimPathRoot(settings.remote, path),
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
  // synchronizes the local and remote clocks
  syncTime: function() {
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
  },

  // maps a file lookup table from an array of file objects
  lookupTable: function(array) {
    //if (!array) { return []; }
    var lookup = [];
    for (var i = 0, len = array.length; i < len; i++) {
      lookup[i] = array[i].id;
    }
    return lookup;
  },

  // trims the base dir of from the file path
  trimPathRoot: function(root, path) {
    var rdirs = root.split('/');
    var fdirs = path.split('/');
    return '/' + fdirs.splice((rdirs.length), (fdirs.length-rdirs.length)).join('/');
  },

  // compare local vs remote file sizes
  isDifferent: function(lfile, rfile) {
    return (lfile.size != rfile.size);
  },

  // compare a local vs remote file for modification 
  isModified: function(lfile, rfile) {
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
}

module.exports = exports;