'use strict';
const path = require('path');
const fs = require('fs');
const cachingFS = require('lasso-caching-fs');
const stripJsonComments = require('strip-json-comments');

var lassoPackageRoot = require('lasso-package-root');
var readOptions = { encoding: 'utf8' };

var babel;

function getBabel() {
    if (!babel) {
        babel = require('babel-core');
    }
    return babel;
}

function readAndParse(path) {
    return JSON.parse(stripJsonComments(
        fs.readFileSync(path, readOptions)));
}

function getBabelOptions(curDir) {
    let babelOptions;
    let babelrcPath = path.join(curDir, '.babelrc');
    let babelrcBrowserPath = path.join(curDir, '.babelrc-browser');

    // First we check for a .babelrc-browser in the directory, if it
    // exists, we read it and break. If not, we do the same for a
    // .babelrc file. Otherwise, we fall back to looking for a
    // package.json in the same directory with a "babel" key.
    if (cachingFS.existsSync(babelrcBrowserPath)) {
        babelOptions = readAndParse(babelrcBrowserPath);
    } else if (cachingFS.existsSync(babelrcPath)) {
        babelOptions = readAndParse(babelrcPath);
    } else {
        let packagePath = path.join(curDir, 'package.json');
        if (cachingFS.existsSync(packagePath)) {
            let packageJson = readAndParse(packagePath);

            if (packageJson.babel) {
                babelOptions = packageJson.babel;
            }
        }
    }
    return babelOptions;
}

function getProjectBabelOptions() {
    let rootPackage = lassoPackageRoot.getRootPackage(path.dirname(require.main.filename));
    let rootPackageDir = rootPackage.__dirname;

    return getBabelOptions(rootPackageDir);
}

module.exports = {
    id: __filename,
    stream: false,
    createTransform(transformConfig) {

        var extensions = transformConfig.extensions;
        var defaultToProjectBabel = transformConfig.defaultToProjectBabel;

        if (!extensions) {
            extensions = ['.js', '.es6'];
        }

        var projectBabelOptions;

        if (defaultToProjectBabel) {
            projectBabelOptions = getProjectBabelOptions();
        }

        extensions = extensions.reduce((lookup, ext) => {
            if (ext.charAt(0) !== '.') {
                ext = '.' + ext;
            }
            lookup[ext] = true;
            return lookup;
        }, {});

        return function lassoBabelTransform(code, lassoContext) {
            var filename = lassoContext.filename;

            if (!filename || !extensions.hasOwnProperty(path.extname(filename))) {
                // This shouldn't be the case
                return code;
            }

            let babelOptions = null;

            var rootPackage = lassoPackageRoot.getRootPackage(path.dirname(filename));
            var rootDir;

            let curDir = path.dirname(filename);

            while (true) {
                babelOptions = getBabelOptions(curDir);
                if (babelOptions) {
                    rootDir = curDir;
                    break;
                }

                if (curDir === rootPackage.__dirname) {
                    rootDir = curDir;
                    break;
                } else {
                    let parentDir = path.dirname(curDir);
                    if (!parentDir || parentDir === curDir) {
                        rootDir = curDir;
                        break;
                    }
                    curDir = parentDir;
                }
            }

            if (!babelOptions) {
                // utilize project's babel options if the option is set and
                // the babel options exist
                if (defaultToProjectBabel && projectBabelOptions) {
                    babelOptions = projectBabelOptions;
                } else {
                    // No babel config... Don't do anything
                    return code;
                }
            }

            babelOptions.filename = path.relative(rootDir, filename);
            babelOptions.babelrc = false;

            var babel = getBabel();
            var result = babel.transform(code, babelOptions);
            return result.code;
        };
    }
};
