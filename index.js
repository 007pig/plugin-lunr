var nodejieba = require("nodejieba");

var PouchDB = require('pouchdb');
var replicationStream = require('pouchdb-replication-stream');
// PouchDB.debug.enable('*');
PouchDB.plugin(replicationStream.plugin);
PouchDB.adapter('writableStream', replicationStream.adapters.writableStream);
PouchDB.plugin(require('pouchdb-upsert'));

var _ = require('lodash');
var path = require('path');
var fs = require('fs');
// var Promise = require("bluebird");
// Promise.longStackTraces();

var rimraf = require('rimraf');

var db = new PouchDB('searchindex');

module.exports = {
    book: {
        assets: './assets',
        js: [
            'pouchdb.min.js', 'pouchdb.load.min.js', 'search-jieba.js'
        ]
    },

    hooks: {
        'init': function () {
            // return db.destroy();
        },

        // Index each page
        'page': function(page) {
            if (this.output.name != 'website' || page.search === false) {
                return page;
            }

            var text, that = this;
            var url = this.output.toURL(page.path);

            this.log.debug.ln('index page', page.path);

            // Transform as TEXT
            text = page.content.replace(/(<([^>]+)>)/ig, '');

            // Add to index
            var doc = {
                url: this.output.toURL(page.path),
                title: page.title,
                summary: page.description,
                body: text
            };

            // 分词
            var words = _.uniq(nodejieba.cutForSearch(page.title + text, true));

            // 移除特殊字符和标点符号
            _.pull(words, ' ', '\n', '(', ')', '.', '-', '（', '）', '　', '：', ':', '，', '。', '—', '？', '[', ']');

            function insertData(word) {
                word = word.toUpperCase();

                return db.upsert('word__' + word, function (newdoc) {
                    if (!newdoc.urls) {
                        newdoc.urls = [];
                    }
                    newdoc.urls = _.union(newdoc.urls, [url]);

                    return newdoc;
                }).then(function() {

                });
            }

            return Promise.all(words.map(insertData))
                .then(function () {
                    // Insert new doc
                    return db.upsert('doc__' + doc.url, function (newdoc) {
                        newdoc.doc = doc;

                        return newdoc;
                    });
                })
                .then(function () {
                    return page;
                });

        },

        // Write index to disk
        'finish': function() {
            var that = this;
            if (this.output.name != 'website') return;

            var file_path = path.resolve(this.output.root(), 'search_jieba_index.dat');

            var ws = fs.createWriteStream(file_path);

            // dump db for browser to load
            return db.dump(ws).catch(function (err) {
                console.log(err);
            }).then(function () {
                return new Promise(function (fulfill, reject) {
                    // Delete levelDB generated by nodejs pouchDB
                    rimraf(path.resolve(that.output.root(), 'searchindex'), function (err) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            fulfill();
                        }
                    });
                })
            });
        }
    }
};

