#! /usr/bin/env node

"use strict";

var fs = require('fs');
var mkdirp = require('mkdirp');
var properties = require('properties');
var _ = require('lodash');
var cli = require('cli').enable('status');

var resourceBundleGenerator = (function () {

    var EXT_PROPERTIES = '.properties';

    var TYPE_JS = 'js';
    var TYPE_JSON = 'json';
    var TYPE_ERR = 'Unsupported type, must be JSON or JS';


    /**
     * Reads the source bundle to be used for merges and then converts all .properties files in the source directory
     * into the requested type.
     *
     * @param {string} sourceBundlePath the path of source bundle use for the merge
     * @param {string} sourceDirectory source directory that contains .properties file to be converted
     * @param {string} outputDirectory the output directory
     * @param {string} type the type of output files (JSON or JS)
     * @param {boolean} isNamespacesUsed If namespaces are used when reading .properties file and when generating bundles
     * @param {string} jsVarName the variable name to use when generating JS files
     */
    function readSourceFileAndConvertFiles(sourceBundlePath, sourceDirectory, outputDirectory, type, isNamespacesUsed, jsVarName) {

        cli.debug('Read source bundle file: ' + sourceBundlePath);

        properties.parse(sourceBundlePath, getParseOptions(isNamespacesUsed), function (err, sourceStrings) {

            if (err && err.code === 'ENOENT') {
                exitWithError('No source file. Looking for: ' + sourceBundlePath + ' in: ' + sourceDirectory);
            }

            mkdirp.sync(outputDirectory);
            convertPropertiesFiles(sourceStrings, sourceDirectory, outputDirectory, type, isNamespacesUsed, jsVarName);
        });
    };

    /**
     * Converts all .properties files in the source directory into resource bundles of the requested type.
     *
     * @param sourceStrings source strings to be merged with translated strings
     * @param {string} sourceDirectory source directory that contains .properties file to be converted
     * @param {string} outputDirectory the output directory
     * @param {string} type the type of output files (JSON or JS)
     * @param {boolean} isNamespacesUsed If namespaces are used when reading .properties file and when generating bundles
     * @param {string} jsVarName the variable name to use when generating JS files
     */
    function convertPropertiesFiles(sourceStrings, sourceDirectory, outputDirectory, type, isNamespacesUsed, jsVarName) {

        cli.debug('Convert properties files');

        fs.readdir(sourceDirectory, function (err, files) {

            files.filter(function (file) {

                return isPropertiesFile(file);

            }).forEach(function (file) {

                var propertiesPath = sourceDirectory + file;
                var outputPath = getOutputPath(outputDirectory, type, file);

                convertPropertiesFile(sourceStrings, propertiesPath, outputPath, type, jsVarName, getParseOptions(isNamespacesUsed));
            });

        });
    };

    /**
     * Returns the output path of the generated bundle given the name
     * of the file to be converted and the conversion type.
     *
     * @param {string} outputDirectory the output directory
     * @param {string} type the type of output files (JSON or JS)
     * @param {string} filename name of the file to be be converted
     * @returns {string} the output path
     */
    function getOutputPath(outputDirectory, type, filename) {

        var outputFilename;

        if (type === TYPE_JS) {
            outputFilename = filename.replace(EXT_PROPERTIES, '.' + TYPE_JS);
        } else {
            outputFilename = filename.replace(EXT_PROPERTIES, '.' + TYPE_JSON);
        }

        return outputDirectory + outputFilename;
    }

    /**
     * Converts a .properties file into a resource bundle of requested type. Merges sources string with
     * the translated strings to ensure that the localized resource bundles contain all the strings required by the
     * application even if the translations are not yet available.
     *
     * @param sourceStrings source strings to be merged with translated strings
     * @param {string} propertiesPath path of the .properties file to be converted
     * @param {string} outputPath the output path of the generated resource bundle
     * @param {string} type the type of output files (JSON or JS)
     * @param {string} jsVarName the variable name to use when generating JS files
     * @param parseOptions options to parse the .properties file
     */
    function convertPropertiesFile(sourceStrings, propertiesPath, outputPath, type, jsVarName, parseOptions) {

        properties.parse(propertiesPath, parseOptions, function (err, localizedStrings) {

            var mergedStrings = _.merge({}, sourceStrings, localizedStrings);

            generateOutputFile(mergedStrings, outputPath, type, jsVarName);

            cli.debug(propertiesPath + ' --> ' + outputPath);
        });
    }


    /**
     * Generate the output file.
     *
     * @param strings the localized strings
     * @param {string} outputPath the output path of the generated resource bundle
     * @param {string} type the type of output files (JSON or JS)
     * @param {string} jsVarName the variable name to use when generating JS files
     */
    function generateOutputFile(strings, outputPath, type, jsVarName) {

        var jsonContent = JSON.stringify(strings);

        var outputContent;

        if (type === TYPE_JS) {
            outputContent = jsVarName + ' = ' + jsonContent + ';';
        } else {
            outputContent = jsonContent;
        }

        fs.writeFileSync(outputPath, outputContent);
    };


    /**
     * Gets parser options use to read .properties files.
     *
     * @param {boolean} isNamespacesUsed if namespaces are used when reading .properties file
     * @returns {{path: boolean, namespaces: *}}
     */
    function getParseOptions(isNamespacesUsed) {
        return {
            path: true,
            namespaces: isNamespacesUsed
        };
    }


    /**
     * Checks if a file is a .properties file.
     *
     * @param {string} filename name of the file to be checked
     * @returns {boolean} true if the file is a .properties file else false
     */
    function isPropertiesFile(filename) {
        return _.endsWith(filename, EXT_PROPERTIES);
    }


    /**
     * Normalize a path to a directory path
     *
     * @param {string} path path to be normalized
     * @returns {string} normalized directory path
     */
    function toDirectoryPath(path) {
        return _.endsWith(path, '/') ? path : path + '/';
    }

    /**
     * Exits the CLI with an error code and displaying a message.
     *
     * @param {string} err the error message to be displayed
     */
    function exitWithError(err) {
        cli.error(err);
        cli.exit(1);
    }

    /**
     * Watch for changes made to properties files in a directory.
     *
     * @param directory directory to watch
     * @param handler handler called when a properties file has changed
     */
    function watchPropertiesInDirectory(directory, handler) {

        fs.watch(directory, function (event, filename) {

            if (isPropertiesFile(filename)) {
                handler(event, filename);
            }
        });
    }

    return {

        generate: function () {

            cli.parse({
                'source-directory': ['s', 'Source directory', 'path', '.'],
                'output-directory': ['o', 'Output directory', 'path', '.'],
                'source-bundle': ['b', 'Source bundle file', 'string', 'en.properties'],
                'use-namespaces': ['n', 'Use namespaces when parsing properties files', 'boolean', false],
                'output-type': ['t', 'Output type: ' + TYPE_JSON + ',' + TYPE_JS, 'string', TYPE_JSON],
                'watch': ['w', 'Watch the source directory for changes and rebuild resource bundles', 'boolean', false],
                'js-variable': [false, ' Varaible name used to generate Javascript file', 'string', 'MESSAGES'],
            });

            cli.main(function (args, options) {

                var sourceDirectory = toDirectoryPath(options['source-directory']);
                var sourceBundlePath = sourceDirectory + options['source-bundle'];
                var outputDirectory = toDirectoryPath(options['output-directory']);
                var isNamespacesUsed = options['use-namespaces'];

                var type = options['output-type'];
                if (type !== TYPE_JSON && type !== TYPE_JS) {
                    exitWithError(TYPE_ERR);
                }

                var jsVarName = options['js-variable'];
                var isWatchEnabled = options.watch;


                cli.debug('Use namespaces: ' + isNamespacesUsed);
                cli.debug('Output directory: ' + outputDirectory);

                if (isWatchEnabled) {
                    cli.info('Start watching: ' + sourceDirectory);

                    watchPropertiesInDirectory(sourceDirectory, function (event, filename) {

                        cli.info(filename + ' changed, generate resource bundles');
                        readSourceFileAndConvertFiles(sourceBundlePath, sourceDirectory, outputDirectory, type, isNamespacesUsed, jsVarName);
                    });

                } else {
                    readSourceFileAndConvertFiles(sourceBundlePath, sourceDirectory, outputDirectory, type, isNamespacesUsed, jsVarName);
                }

            });
        }
    };
})();

resourceBundleGenerator.generate();

