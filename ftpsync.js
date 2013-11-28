// Design Notes
// ----------------------------------------------------------------------------
// TODO:
// - prepare for export
// - add touch() function
// - finish implementing timeSync()
// - fix time comparison on isModified
// - add delete() function
// - add verify() function

// Setup
// ----------------------------------------------------------------------------
var fs = require('fs');
var path = require('path');
var jsftp = require('jsftp');
var async = require('async');
var config = require('./config.json');

var ftp = new jsftp({
  host: config.host,
  port: config.port,
  user: config.user,
  pass: config.pass,
});

var maxConnections = 1;

var localRoot = config.local;
var remoteRoot = config.remote;
var ignore = config.ignore;

var remote = [];
var local = [];
var add = [];
var update = [];
var remove = [];

var ltimeOffset;
var rtimeOffset;

// process functions
// ----------------------------------------------------------------------------
function setup(callback) {
  return;
}

function collect(callback) {
  console.log('Collecting');
  console.log('-------------------------------------------------------------');
  async.series([
    function(callback) { 
      walkLocal(localRoot, callback);
    },
    function(callback) {
      walkRemote(remoteRoot, callback);
    }
  ], function(err, results) {
    local = results[0];
    remote = results[1];
    console.log('Local Files:');
    console.log(prettyPrint(local));
    console.log('Remote Files:');
    console.log(prettyPrint(remote));
      
    callback(null, 'collection complete');
  });
}

function walkLocal(dir, callback) {
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
      if (ignore.indexOf(file) != -1) { 
        next();
        return;
      }
      // get file/dir name/stats
      var path = dir + '/' + file;
      fs.stat(path, function(err, stat) {
        // handle directories
        if (stat.isDirectory()) {
          walkLocal(path, function(err, res) { // recurse & shit
            results = results.concat(res);
            next();
          });
          return;
        }
        // handle files
        if (stat.isFile()) {
          results.push({
            'id':trimRoot(localRoot, path),
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
};

function walkRemote(dir, callback) {
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
      if (ignore.indexOf(file.name) != -1) { 
        next();
        return;
      }
      // get file/dir name/stats
      var path = dir + '/' + file.name;
      // handle directories
      if (file.type == 1) {
        walkRemote(path, function(err, res) { // recurse & shit
          results = results.concat(res);
          next();
        });
        return;
      }
      // handle files
      if (file.type = 2) {
        results.push({
          'id':trimRoot(remoteRoot, path),
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
}

function consolidate(callback) {
  console.log('Consolidating');
  console.log('-------------------------------------------------------------');
  // create lookup tebles for easy comparison
  var rFiles = lookupTable(remote);
  var lFiles = lookupTable(local);
  // run the comparison
  rFiles.forEach(function(file) {
    var lIDX = lFiles.indexOf(file);
    if (lIDX != -1) {
      var rIDX = rFiles.indexOf(file);
      var lFile = local[lIDX];
      var rFile = remote[rIDX];
      if (isDifferent(local[lIDX], remote[rIDX])) {
        update.push(file);
      }
      // mark matches for removal
      lFiles[lIDX] = '';
      rFiles[rIDX] = '';
    }
  });
  // remove matches from local and remote tables
  rFiles.forEach(function(file) {
    if(file === '') { return; }
    remove.push(file);
  });
  lFiles.forEach(function(file) {
    if(file === '') { return; }
    add.push(file);
  });

  // output the results
  console.log('Updates:');
  console.log(prettyPrint(update));
  console.log('Add:');
  console.log(prettyPrint(add));
  console.log('Remove:');
  console.log(prettyPrint(remove));

  callback(null, 'consolidation complete');
}

function commit(callback) {
  console.log('Committing');
  console.log('-------------------------------------------------------------');
  async.series([
    function(callback) {
      if (add.length == 0) { callback(null, 'no additions'); return; }
      async.mapLimit(add, maxConnections, upload, function (err) {
        if (err) {
          callback(err, 'additions failed');
        }
        else {
          callback(null, 'additions complete');
        }
      });
    },
    function(callback) {
      if (update.length == 0) { callback(null, 'no updates'); return; }
      async.mapLimit(update, maxConnections, upload, function (err) {
        if (err) {
          callback(err, 'updates failed');
        }
        else {
          callback(null, 'updates complete');
        }
      });
    },
    function(callback) {
      if (remove.length == 0) { callback(null, 'no removals'); return; }
      // TODO: add stuff here
      callback(null, 'removals complete');
    }
  ],
  function(err, results) {
    console.log(results);
    callback(null, 'commit complete');
  });
}

// upload a file to the remote server
function upload(file, callback) {
  var local = localRoot + file;
  var remote = remoteRoot + file;
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
}

function remove(file, callback) {
  return;
}

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

// prints an array in a human-readable format
function prettyPrint(results) {
  return JSON.stringify(results, null, '\t');
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
function trimRoot(root, file) {
  var rdirs = root.split('/');
  var fdirs = file.split('/');
  return '/' + fdirs.splice((rdirs.length), (fdirs.length-rdirs.length)).join('/');
}

// init
// ----------------------------------------------------------------------------
async.series([
  function(callback) {
    collect(callback);
  },
  function(callback) {
    consolidate(callback);
  },
  function(callback) {
    commit(callback);
  }
], 
function(err, results) {
  if (!err) {
    console.log(results);
    //node.exit(0);
  }
});
