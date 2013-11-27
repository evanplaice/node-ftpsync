// Design Notes
// ----------------------------------------------------------------------------
// Step 1 - collect:
// In the first step the script accomplishes two tasks in parallel. Syncing the 
// clocks and collecting the file lists of both the local and remote.
//
// Step 2 - consolidate:
// In the next step the file lists are consolidated into 3 collections, [add]
// files that are missing from the remote, [remove] files that are missing from 
// the local, and [update] files that have changed. Modifications are evaluated 
// by comparing the file sizes and timestamps.
//
// Step 3 - commit:
// Finally, the files from the 3 lists (ie add, remove, update) are pushed to
// the remote. 
//
// Step 4 - verify:
// Verify the changes to ensure all commits are done.
//
// TODO:
// - add file size comparision to isModified
// - fix time comparison on isModified
// - fix timeSync() to work with upload()
// - add upload() function
// - add add() function
// - add update() function
// - add delete() function
// - add touch() function

// Setup
// ----------------------------------------------------------------------------
var fs = require('fs');
var path = require('path');
var jsftp = require('jsftp');
var async = require('async');
var config = require('./config.json');

var localRoot = config.local;
var remoteRoot = config.remote;
var ignore = config.ignore;

var ftp = new jsftp({
  host: config.host,
  port: config.port,
  user: config.user,
  pass: config.pass,
});

var remote = [];
var local = [];
var add = [];
var update = [];
var remove = [];

var ltimeOffset;
var rtimeOffset;

// process functions
// ----------------------------------------------------------------------------
function collect(callback) {
  console.log('Collecting...');
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
      // get file name & stats
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        // handle directories
        if (stat.isDirectory()) {
          walkLocal(file, function(err, res) {
            results = results.concat(res);
            next();
          });
          return;
        }
        // handle files
        if (stat.isFile()) {
          results.push({
            'id':trimRoot(localRoot, file),
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
      // get file name & stats
      var path = dir + '/' + file.name;
      // handle directories
      if (file.type == 1) {
        walkRemote(path, function(err, res) {
          results = results.concat(res);
          next();
        });
        return;
      }
      // handle files
      if (file.type = 2) {
        results.push({
          'id':trimRoot(remoteRoot, path),
          'size':file.size,
          'time':new Date(file.time)
        });
        next();
        return;
      }
      // skip everything else
      else { next(); }
    })();
  });
}

function consolidate(callback) {
  // create lookup tebles for easy comparison
  var remoteID = lookupTable(remote);
  var localID = lookupTable(local);
  // run the comparison
  remoteID.forEach(function(file) {
    var localIDX = localID.indexOf(file); 
    if (localIDX != -1) {
      var remoteIDX = remoteID.indexOf(file);
      update.push({'id':file, 'ltime':local[localIDX].time, 'rtime':remote[remoteIDX].time});
      // mark matches for removal
      localID[localIDX] = '';
      remoteID[remoteIDX] = '';
    }
  });
  // remove matches from local and remote tables
  remoteID.forEach(function(file) {
    if(file === '') { return; }
    remove.push(file);
  });
  localID.forEach(function(file) {
    if(file === '') { return; }
    add.push(file);
  });

  console.log('Updates:');
  console.log(prettyPrint(update));
  console.log('Add:');
  console.log(prettyPrint(add));
  console.log('Remove:');
  console.log(prettyPrint(remove));
  //var lastEntry = update[update.length - 1];
  //syncTime(lastEntry.ltime, lastEntry.rtime);
  //isModified(lastEntry.ltime, lastEntry.rtime);

  callback(null, 'consolidation complete');
}

function commit(callback) {
  add('./test/file.txt');
  return;
}

function add(file, callback) {
  var dirs = file.split('/');
  ftp.cwd(remoteRoot);
  console.log(ftp.ls);
}

function update(file, callback) {
  return;
}

function remove(file, callback) {
  return;
}

// helper functions
// ----------------------------------------------------------------------------

// maps a file lookup table from an array of file objects
function lookupTable(array) {
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

// compare a local vs remote file for modification 
function isModified(ltime, rtime) {
  // round to the nearest minute
  var minutes = 1000 * 60;
  var hours = 1000 * 60 * 60;
  //var ltime = new Date(((Math.round(ltime / minutes) * minutes) - (ltimeOffset * hours)));
  //var rtime = new Date(((Math.round(rtime / minutes) * minutes) - (rtimeOffset * hours)));
  var ltime = new Date(Math.round(ltime / minutes) * minutes);
  var rtime = new Date(Math.round(rtime / minutes) * minutes);
  console.log('Compare:');
  console.log('lTime: ' + ltime);
  console.log('rTime: ' + rtime);
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

function upload() {
  return;
}

// init
// ----------------------------------------------------------------------------
async.series([
  //function(callback) {
  //  console.log(trimBase("c:/this/is/some/shit", 'c:/this/is/some/shit/test/test.txt'));
  //}
  function(callback) {
    collect(callback);
  },
  function(callback) {
    consolidate(callback);
  },
  //function(callback) {
  //  commit(callback);
  //}
], 
function(err, results) {
  if (!err) {
    console.log(results);
    //node.exit(0);
  }
});
