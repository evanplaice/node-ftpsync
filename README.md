An FTP synchronization app for NodeJS based on [jsftp](https://npmjs.org/package/jsftp). With an emphasis on speed and simplicity ftpsync aims to fulfull your one-click file deployment needs.

[![NPM](https://nodei.co/npm/ftpsync.png)](https://nodei.co/npm/ftpsync/)


**Warning: This app is currently in the early alpha stages of development. Feel free to try it out and contribute fixes/feedback but it would be wise to wait a few releases before using it in a production environment.**

Getting Started
--------------

Create a configuration file

*config.json*
```javascript
{
  "local":"~/www/",
  "remote":"/",
  "host":"example.com",
  "port":21,
  "user":"username",
  "pass":"password",
  "ignore":[
    ".htaccess"
  ]
}
```

*See [ftpsync.settings{}](#ftpsyncsettings) for detailed info about the settings.*

Just put the config.json file in the same folder as ftpsync.js and run the sync.

`npm ftpsync.js`

If you'd like to see the output simply pipe the console to a log file.
`npm ftpsync.js > ftpsync.log &`

Usage
----------------

A universal bin file is currently under development.

API
----------------

#### new ftpsync(options)

Creates a new ftpsync instance.

  - `options{}` an object containing settings for ftpsync.

*See [ftpsync.settings{}](#ftpsyncsettings) for detailed info about the settings.*

#### ftpsync.settings{}

Contains the application settings for ftpsync.

  - `host` - hostname/address of the remote ftp server (required).
  - `port` - port of the remote ftp server (default `21`).
  - `user` - ftp username (required).
  - `pass` - ftp password (required).
  - `localRoot` - the root directory of the local host (default `'./'`).
  - `remoteRoot` - the root path of the remote server (default `'./'`).
  - `maxConnections` - the max number of concurrent ftp connections (default `1`).
  - `lTimeOffset` - the local hosts timezone offset (autodetected). 
  - `rTimeOffset` - the remoge ftp server's timezone offset (autodetected).

#### ftpsync.local[]

The file listing for the local host. Populated by running `ftpsync.collect()`.

#### ftpsync.remote[]

The file listing for the remote server. Populated by running `ftpsync.collect()`.

#### ftpsync.add[]

The list of files queued to for addition to the remote server. Populated by running `ftpsync.consolidate()`.

#### ftpsync.update[]

The list of files queued for update on the remote server. Populated by running `ftpsync.consolidate()`.

#### ftpsync.remove[]

The list of files queued for removal from the remote server. Populated by running `ftpsync.consolidate()`.

### Methods

#### ftpsync.setup(callback)

The initialization step of the sunchronization process. This function accomplishes two tasks, First, it checks to see that all the required settings are present. Second, it synchronizes the local host and remote server clocks.

*The setup will fail if the following settings aren't defined:*

  - `host`
  - `port`
  - `user`
  - `pass`

*See [ftpsync.settings{}](#ftpsyncsettings) for detailed info about the settings.*

#### ftpsync.collect(callback)

Walks the file trees for both the local host and remote server and prepares them for further processing. The resulting file lists are stored in `ftpsync.local[]`, and `ftpsync.remote[]` upon successful completion.

#### ftpsync.consolidate(callback)

Runs comparisons on the local and remote file listings. Files that exist in the local directory are but not the remote are queued up for addition. Files that exist in both but are different (determined by file size and time stamp) are queued for update. Files that exist in on the remote directory but not the local are queued for removal. The resulting queues can be found in `ftpsync.add[]`, `ftpsync.update[]`, and `ftpsync.remove[]` upon successful completion.

#### ftpsync.commit(callback)

Executes the tasks contained in the `ftpsync.add[]`, `ftpsync.update[]`, and `ftpsync.remove[]` lists.

### Helper Methods

#### ftpsync.walkLocal(dir, callback)

Walks the local directory tree and returns a list of files.

#### ftpsync.walkRemote(dir, callback)

Walks the remote directory tree and returns a list of files.

Installation
------------

    npm install ftpsync

License
-------

See LICENSE.
