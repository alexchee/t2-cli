global.IS_TEST_ENV = true;

// System Objects
global.cp = require('child_process');
global.events = require('events');
global.http = require('http');
global.os = require('os');
global.path = require('path');
global.stream = require('stream');
global.url = require('url');
global.util = require('util');
global.zlib = require('zlib');

global.Emitter = events.EventEmitter;
global.Duplex = stream.Duplex;
global.Stream = stream.Stream;
global.Transform = stream.Transform;


// Third Party Dependencies
global.acorn = require('acorn');
global.async = require('async');
global.bindings = require('bindings');
global.charSpinner = require('char-spinner');
global.concat = require('concat-stream');
global.fs = require('fs-extra');
global.fsTemp = require('fs-temp');
global.fstream = require('fstream');
global.Ignore = require('fstream-ignore');
global.inquirer = require('inquirer');
global.mdns = require('mdns-js');
global.mkdirp = require('mkdirp');
global.npmlog = require('npmlog');
global.osenv = require('osenv');
global.Project = require('t2-project');
global.Progress = require('progress');
global.request = require('request');
global.sinon = require('sinon');
global.sshpk = require('sshpk');
global.ssh = require('ssh2');
global.tags = require('common-tags');
global.tar = require('tar');
global.toml = require('toml');
global.uglify = require('uglify-js');


// Internal
// ./lib/tessel/*
global.Tessel = require('../../lib/tessel/tessel');
global.commands = require('../../lib/tessel/commands');
global.deploy = require('../../lib/tessel/deploy');
global.deployment = require('../../lib/tessel/deployment/index');
global.glob = require('../../lib/tessel/deployment/glob');
global.provision = require('../../lib/tessel/provision');
global.restore = require('../../lib/tessel/restore');
global.RSA = require('../../lib/tessel/rsa-delegation');

// ./lib/*
global.CrashReporter = require('../../lib/crash-reporter');
global.Menu = require('../../lib/menu');
global.Preferences = require('../../lib/preferences');
global.controller = require('../../lib/controller');
global.discover = require('../../lib/discover');
global.init = require('../../lib/init');
global.installer = require('../../lib/installer');
global.log = require('../../lib/log');
global.updates = require('../../lib/update-fetch');
global.lan = require('../../lib/lan-connection');
global.usb = require('../../lib/usb-connection');

// ./lib/usb/*
global.Daemon = require('../../lib/usb/usb-daemon');
global.USBProcess = require('../../lib/usb/usb-process');

// ./test/common/*
global.TesselSimulator = require('../common/tessel-simulator');
global.RemoteProcessSimulator = require('../common/remote-process-simulator');

// ./bin/*
global.cli = require('../../bin/tessel-2');

// ./package.json
global.cliPackageJson = require('../../package.json');

// Shorthands
global.LAN = lan.LAN;
global.TesselSeeker = discover.TesselSeeker;
global.USB = usb.USB;

global.Request = function Request() {};
util.inherits(global.Request, global.Stream);



// Deployment Utilities, shared across
//
// - test/unit/deploy.js
// - test/unit/deployment/javascript.js
// - test/unit/deployment/python.js
// - test/unit/deployment/rust.js
//

global.DEPLOY_DIR_JS = path.join(process.cwd(), 'test/unit/', 'tmp');
global.DEPLOY_FILE_JS = path.join(global.DEPLOY_DIR_JS, 'app.js');
global.jsCodeContents = 'console.log("testing deploy");';
global.jsCodeReference = new Buffer(global.jsCodeContents);

global.DEPLOY_DIR_RS = path.join(process.cwd(), 'test/unit/fixtures', 'rust-deploy-template');


global.deployTestCode = function(tessel, opts, callback) {
  // Create the temporary folder with example code
  createTemporaryDeployCode()
    .then(() => {

      function closeAdvance(event) {
        if (event === 'close') {
          setImmediate(() => {
            // Emit the close event to keep it going
            tessel._rps.emit('close');
          });
        }
      }

      // When we get a listener that the Tessel process needs to close before advancing
      tessel._rps.on('newListener', closeAdvance);

      // Actually deploy the script
      tessel.deploy({
          entryPoint: path.relative(process.cwd(), global.DEPLOY_FILE_JS),
          push: opts.push,
          single: opts.single
        })
        // If it finishes, it was successful
        .then(() => {
          tessel._rps.removeListener('newListener', closeAdvance);
          callback();
        })
        // If not, there was an issue
        .catch(callback);
    });
};

global.createTemporaryDeployCode = function() {
  return new Promise((resolve, reject) => {
    mkdirp(global.DEPLOY_DIR_JS, (err) => {
      if (err) {
        return reject(err);
      } else {
        fs.writeFile(global.DEPLOY_FILE_JS, jsCodeContents, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }
    });
  });
};

global.deleteTemporaryDeployCode = function() {
  return new Promise(function(resolve, reject) {
    fs.remove(global.DEPLOY_DIR_JS, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

global.extract = function(bundle, callback) {
  var parser = tar.Parse();
  var entries = [];

  parser.on('entry', (entry) => {
    if (entry.type === 'File') {
      entries.push(entry.path);
    }
  });

  parser.on('end', () => {
    callback(null, entries);
  });

  parser.on('error', (error) => {
    callback(error, null);
  });

  parser.end(bundle);
};
