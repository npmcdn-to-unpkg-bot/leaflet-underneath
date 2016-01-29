var Protobuf = require('pbf'),
    VectorTile = require('vector-tile').VectorTile,
    L = require('leaflet'),
    corslite = require('corslite');

module.exports = L.TileLayer.Pois = L.TileLayer.extend({
    options: {
        layers: ['poi_label'],
        maxScalerank: 2
    },

    initialize: function(tileUrl, options) {
        L.TileLayer.prototype.initialize.call(this, tileUrl, options);
        this._featureLayer = L.geoJson(null, {
            onEachFeature: function(f, l) {
                l.bindPopup('<h3>' + f.properties.name + '</h3>');
            }
        });
    },

    onAdd: function(map) {
        L.TileLayer.prototype.onAdd.call(this, map);
        this._featureLayer.addTo(map);
    },

    onRemove: function(map) {
        L.TileLayer.prototype.onRemove.call(this, map);
        map.removeLayer(this._featureLayer);
    },

    _addTile: function(tilePoint) {
        var tile = { datum: null, processed: false };
        this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;
        this._loadTile(tile, tilePoint);
    },

    _loadTile: function(tile, tilePoint) {
        this._adjustTilePoint(tilePoint);
        var request = corslite(this.getTileUrl(tilePoint), L.bind(function(err, data) {
            if (err) {
                // TODO: error handling
                return console.log(err);
            }

            this._tileLoaded(tile, tilePoint, new Uint8Array(data.response));
        }, this), true);
        request.responseType = 'arraybuffer';
    },

    _reset: function() {
        L.TileLayer.prototype._reset.call(this);
        this._featureLayer.clearLayers();
    },

    _tileLoaded: function(tile, tilePoint, data) {
        var x = tilePoint.x,
            y = tilePoint.y,
            z = tilePoint.z,
            maxScalerank = this.options.maxScalerank,
            i,
            j,
            layerName,
            layer,
            f;

        tile.datum = new VectorTile(new Protobuf(data));

        for (i = 0; i < this.options.layers.length; i++) {
            layerName = this.options.layers[i];
            layer = tile.datum.layers[layerName];
            if (layer) {
                for (j = 0; j < layer.length; j++) {
                    f = layer.feature(j);
                    if (f.properties['scalerank'] <= maxScalerank) {
                        this._featureLayer.addData(f.toGeoJSON(x, y, z));
                    }
                }
            }
        }
    }
});

