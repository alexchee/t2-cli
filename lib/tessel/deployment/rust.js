// System Objects
var path = require('path');
var http = require('http');
var path = require('path');
var url = require('url');

// Third Party Dependencies
var fs = require('fs-extra');
var tags = require('common-tags');
var tar = require('tar');
var toml = require('toml');
var Reader = require('fstream').Reader;

// Internal
var commands = require('../commands');
var lists = require('./lists/rust');
var log = require('../../log');
var Tessel = require('../tessel');

var exportables = {
  meta: {
    name: 'rust',
    extname: 'rs',
    binary: '.',
    entry: 'src/main.rs',
    configuration: 'Cargo.toml',
    checkConfiguration: (pushdir, basename, program) => {
      var cargoToml = toml.parse(fs.readFileSync(path.join(pushdir, 'Cargo.toml'), 'utf8'));

      if (cargoToml.package) {
        basename = path.basename(program);
        program = cargoToml.package.name;
      }

      return {
        basename,
        program
      };
    },
    shell: (options) => {
      return tags.stripIndent `
        #!/bin/sh
        exec /app/remote-script/${options.resolvedEntryPoint} ${options.subargs.join(' ')}
      `;
    },
  },
  lists: lists,
};

// The Rust prebundle step just updated the resolvedEntryPoint
// property with the Rust binary name
exportables.preBundle = function(opts) {
  return new Promise((resolve, reject) => {
    // Get details of the project
    var details = exportables.meta.checkConfiguration(opts.target);

    // If it was unable to fetch the details
    if (typeof details !== 'object') {
      // Abort the deploy
      return reject('Unable to parse Cargo.toml');
    } else {
      // Update the resolved entry point to the program name
      opts.resolvedEntryPoint = details.program;
      // Continue with the deploy
      resolve();
    }
  });
};

// This must implement a Promise that resolves with a Buffer
// that represents a DIRECTORY containing the compiled Rust
// executable.
exportables.tarBundle = function(opts) {
  return exportables.remoteRustCompilation(opts);
};

/*
exportables.postRun = function(tessel, options) {
  return Promise.resolve();
};
*/

// The following line will be ignored by JSHint because
// presently, `opts` is not in use, but it's valuable to
// include the parameter in the list.
exportables.preRun = function(tessel, opts) { // jshint ignore:line
  return tessel.simpleExec(commands.chmod('+x', `${Tessel.REMOTE_RUN_PATH}${opts.resolvedEntryPoint}`));
};

exportables.remoteRustCompilation = (opts) => {
  log.info('Compiling Rust code remotely...');
  return new Promise(function(resolve, reject) {

    // Save our incoming compiled buffer to this array
    var buffers = [];

    // Parse out the components of the remote rust compilation server
    if (!opts.rustcc.startsWith('http')) {
      // Without an HTTP protocol definition, url.parse will fail;
      // assume http:// was implied
      opts.rustcc = 'http://' + opts.rustcc;
    }
    var destination = url.parse(opts.rustcc);

    // The location of our cross compilation server
    var options = {
      host: destination.hostname,
      port: destination.port,
      path: '/rust-compile',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      }
    };

    // Set up the request
    var req = http.request(options, (res) => {
      // When we get incoming binary data, save to our buffers
      res.on('data', function(chunk) {
          // Write this incoming data to our buffer collection
          buffers.push(chunk);
        })
        // Reject on failure
        .on('error', function(postReqError) {
          return reject(postReqError);
        })
        // When the post completes, resolve with the executable
        .on('end', function() {

          // Parse the incoming data as JSON
          var result = JSON.parse(Buffer.concat(buffers));

          // Check if there was an error message written
          if (result.error !== undefined && result.error !== '') {
            // If there was, abort with the provided message
            return reject(new Error(result.error));
          }

          // Print out any stderr output
          else if (result.stderr !== null && result.stderr !== '') {
            log.info(result.stderr);
          }

          // Print out any stdout output
          if (result.stdout !== null) {
            log.info(result.stdout);
          }

          // If the binary was not provided
          if (result.binary === null) {
            // Reject with an error
            return reject(new Error('Neither binary nor error returned by cross compilation server.'));
          }
          // If the binary was provided
          else {
            // All was successful and we can return
            return resolve(new Buffer(result.binary, 'base64'));
          }
        });
    });

    // Create an outgoing tar packer for our project
    var outgoingPacker = tar.Pack({
        noProprietary: true
      })
      .on('error', reject);

    // Send the project directory through the tar packer and into the post request
    Reader({
        path: opts.target,
        type: 'Directory'
      })
      .on('error', reject)
      .pipe(outgoingPacker)
      .pipe(req);
  });
};

module.exports = exportables;
