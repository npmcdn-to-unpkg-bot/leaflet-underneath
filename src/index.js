var Protobuf = require('pbf'),
    VectorTile = require('vector-tile').VectorTile,
    L = require('leaflet'),
    corslite = require('corslite'),
    rbush = require('rbush');

module.exports = L.TileLayer.Underneath = L.TileLayer.extend({
    options: {
        layers: [],
        defaultTolerance: 100,
        isDuplicate: function(f, context) {
            var osmId = f.properties.osm_id,
                name = f.properties.name,
                isDupe = context[osmId] || context[name];

            if (!isDupe) {
                context[osmId] = true;
                context[name] = true;
            }

            return isDupe;
        },
        lazy: true
    },

    initialize: function(tileUrl, options) {
        L.TileLayer.prototype.initialize.call(this, tileUrl, options);
        this._bush = rbush(this.options.rbushMaxEntries);
    },

    query: function(latLng, tolerance, cb, context) {
        if (!this._map) return;

        tolerance = tolerance || this.options.defaultTolerance;

        var p = this._map.project(latLng),
            tilePoint = p.divideBy(this.options.tileSize)._floor(),
            query = function query() {
                var sqDistToP = function(s) {
                        var dx = s[0] - p.x,
                            dy = s[1] - p.y;
                        return dx * dx + dy * dy;
                    },
                    halfT = tolerance / 2,
                    search = this._bush.search([p.x - halfT, p.y - halfT, p.x + halfT, p.y + halfT]),
                    results = [],
                    context = {},
                    isDuplicate = this.options.isDuplicate,
                    i,
                    f;

                search.sort(function(a, b) { return sqDistToP(a) - sqDistToP(b); });

                for (i = 0; i < search.length; i++) {
                    f = search[i][4];
                    if (!isDuplicate(f, context)) {
                        results.push(f);
                    }
                }

                cb.call(context, null, results);
            }.bind(this);

        if (this.options.lazy && !this._tiles[this._tileKey(tilePoint)]) {
            this._addTile(tilePoint, null, true, query);
            return this;
        }

        query();
        return this;
    },

    _addTile: function(tilePoint, fragment, force, cb) {
        var key = this._tileKey(tilePoint),
            tile = { datum: null, processed: false };

        cb = cb || function() {};

        if (!this._tiles[key] && (!this.options.lazy || force)) {
            this._tiles[key] = tile;
            return this._loadTile(tile, tilePoint, cb);
        }

        return cb();
    },

    _tileKey: function(tilePoint) {
        return tilePoint.x + ':' + tilePoint.y;
    },

    _loadTile: function(tile, tilePoint, cb) {
        var url,
            request;

        cb = cb || function() {};

        this._adjustTilePoint(tilePoint);
        url = this.getTileUrl(tilePoint);
        request = corslite(url, L.bind(function(err, data) {
            if (err) {
                this.fire('tileerror', {
                    tilePoint: tilePoint,
                    url: url,
                    error: err
                });
                return cb(err);
            }

            this._tileLoaded(tile, tilePoint, new Uint8Array(data.response));
            return cb();
        }, this), true);
        request.responseType = 'arraybuffer';
    },

    _reset: function() {
        L.TileLayer.prototype._reset.call(this);
        this._bush.clear();
        this.fire('featurescleared');
    },

    _tileLoaded: function(tile, tilePoint, data) {
        var x = tilePoint.x,
            y = tilePoint.y,
            z = tilePoint.z,
            vectorTile = new VectorTile(new Protobuf(data)),
            filter = this.options.filter,
            i,
            j,
            layerName,
            layer,
            f,
            p,
            geojson;

        tile.processed = true;

        for (i = 0; i < this.options.layers.length; i++) {
            layerName = this.options.layers[i];
            layer = vectorTile.layers[layerName];
            if (layer) {
                for (j = 0; j < layer.length; j++) {
                    f = layer.feature(j);
                    if (!filter || filter(f)) {
                        geojson = f.toGeoJSON(x, y, z);
                        if (geojson.geometry.type !== 'Point') {
                            this.fire('featureerror', {
                                tilepoint: tilePoint,
                                error: 'Feature does not have a point geometry',
                                feature: f
                            });
                            continue;
                        }
                        p = this._map.project([geojson.geometry.coordinates[1], geojson.geometry.coordinates[0]]);
                        this._bush.insert([p.x, p.y, p.x, p.y, geojson]);
                        this.fire('featureadded', {
                            feature: geojson
                        });
                    }
                }
            }
        }
    }
});

