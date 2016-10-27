'use strict';
// helpers provide a core set of various utility methods to compiled templates
var helpers;

/**
 * Method is for internal usage only. This method
 * is invoked by code in a compiled Marko template and
 * it is used to create a new Template instance.
 * @private
 */
 exports.c = function createTemplate(path, createFunc, meta) {
     var template = new Template(path, lazyRender);
     template.meta = meta;
     return template;

    function lazyRender() {
        template._ = createFunc(helpers);
        template._.apply(template, arguments);
    }
};

var BUFFER_OPTIONS = { buffer: true };
var asyncWriter = require('async-writer');
var AsyncStream = asyncWriter.AsyncStream;

function createOut(globalData) {
    return new AsyncStream(globalData);
}

// If the optional "stream" module is available
// then Readable will be a readable stream

var extend = require('raptor-util/extend');

exports.AsyncStream = AsyncStream;

function renderCallback(renderFunc, data, globalData, callback) {
    var out = new AsyncStream(globalData);

    renderFunc(data, out);
    return out.end()
        .on('finish', function() {
            callback(null, out.getOutput(), out);
        })
        .once('error', callback);
}

function Template(path, func, options) {
    this.path = path;
    this._ = func;
    this._options = !options || options.buffer !== false ?
        BUFFER_OPTIONS : null;
}

Template.prototype = {
    createOut: createOut,

    renderSync: function(data) {
        var localData;
        var globalData;

        if ((localData = data)) {
            globalData = localData.$global;
        } else {
            localData = {};
        }

        var out = new AsyncStream(globalData);
        out.sync();

        this._(localData, out);
        return out.getOutput();
    },

    /**
     * Renders a template to either a stream (if the last
     * argument is a Stream instance) or
     * provides the output to a callback function (if the last
     * argument is a Function).
     *
     * Supported signatures:
     *
     * render(data, callback)
     * render(data, out)
     * render(data, stream)
     * render(data, out, callback)
     * render(data, stream, callback)
     *
     * @param  {Object} data The view model data for the template
     * @param  {AsyncStream} out A Stream or an AsyncStream instance
     * @param  {Function} callback A callback function
     * @return {AsyncStream} Returns the AsyncStream instance that the template is rendered to
     */
    render: function(data, out, callback) {
        var renderFunc = this._;
        var finalData;
        var globalData;
        if (data) {
            finalData = data;

            if ((globalData = data.$global)) {
                // We will *move* the "$global" property
                // into the "out.global" object
                data.$global = null;
            }
        } else {
            finalData = {};
        }

        if (typeof out === 'function') {
            // Short circuit for render(data, callback)
            return renderCallback(renderFunc, finalData, globalData, out);
        }

        // NOTE: We create new vars here to avoid a V8 de-optimization due
        //       to the following:
        //       Assignment to parameter in arguments object
        var finalOut = out;

        var shouldEnd = false;

        if (arguments.length === 3) {
            // render(data, out, callback)
            if (!finalOut || !finalOut.isAsyncStream) {
                finalOut = new AsyncStream(globalData, finalOut);
                shouldEnd = true;
            }

            finalOut
                .on('finish', function() {
                    callback(null, finalOut.getOutput(), finalOut);
                })
                .once('error', callback);
        } else if (!finalOut || !finalOut.isAsyncStream) {
            var options = this._options;
            var shouldBuffer = options && options.shouldBuffer;
            // Assume the "finalOut" is really a stream
            //
            // By default, we will buffer rendering to a stream to prevent
            // the response from being "too chunky".
            finalOut = new AsyncStream(globalData, finalOut, null, shouldBuffer);
            shouldEnd = true;
        }

        if (globalData) {
            extend(finalOut.global, globalData);
        }

        // Invoke the compiled template's render function to have it
        // write out strings to the provided out.
        renderFunc(finalData, finalOut);

        // Automatically end output stream (the writer) if we
        // had to create an async writer (which might happen
        // if the caller did not provide a writer/out or the
        // writer/out was not an AsyncStream).
        //
        // If out parameter was originally an AsyncStream then
        // we assume that we are writing to output that was
        // created in the context of another rendering job.
        return shouldEnd ? finalOut.end() : finalOut;
    },

    stream: function() {
        throw new Error('You must require("marko/stream")');
    }
};

function createInlineMarkoTemplate(filename, renderFunc) {
    return new Template(filename, renderFunc);
}

exports.createWriter = function(writer) {
    return new AsyncStream(null, writer);
};

exports._inline = createInlineMarkoTemplate;

exports.createOut = createOut;

exports.Template = Template;

helpers = require('./helpers');
exports.helpers = helpers;



require('../')._setRuntime(exports);

