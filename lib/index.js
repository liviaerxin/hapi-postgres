'use strict';

const pg = require('pg');
const Joi = require('joi');

const singleOption = Joi.object({
    settings: [Joi.object()],
    decorate: [true, Joi.string()],
}).strict();
const optionsSchema = Joi.array().items(singleOption).min(1).single();

exports.plugin = {
    pkg: require('../package.json'),
    register: async function (server, pluginOptions) {
        const { value: options } = await optionsSchema.validate(pluginOptions);

        const decorationTypes = new Set(options.map(option => typeof option.decorate));
        if (decorationTypes.size > 1) {
            throw new Error('You cannot mix different types of decorate options');
        }
        const expose = {
            lib: pg,
        };

        async function connect(connectionOptions) {
            const pool = new pg.Pool(connectionOptions.settings);
            const client = new pg.Client(connectionOptions.settings);
            try {
                await client.connect();
            } catch (err) {
                server.log(['hapi-postgresql', 'error'], err);
            }

            //TODO: retrieve connection host, port, username, password from configuration
            const { user, host, database } = connectionOptions.settings;
            const info = `${user}@${host}/${database}`;

            server.log(['hapi-postgresql', 'info'], `hapi connection created for ${info}`);

            if (typeof connectionOptions.decorate === 'string') {
                const decoration = Object.assign({ pool, client }, expose);
                server.decorate('server', connectionOptions.decorate, decoration);
                server.decorate('request', connectionOptions.decorate, decoration);
            }
            return { pool, client };
        }

        try {
            const results = await Promise.all(options.map(connect));
            expose.pool = options.length === 1 ? results[0].pool : results.map(r => r.pool);
            expose.client = options.length === 1 ? results[0].client : results.map(r => r.client);
        } catch (err) {
            server.log(['hapi-postgresql', 'error'], err);
            throw err;
        }

        if (decorationTypes.has('boolean')) {
            server.decorate('server', 'pg', expose);
            server.decorate('request', 'pg', expose);
        } else if (decorationTypes.has('undefined')) {
            Object.keys(expose).forEach(key => {
                server.expose(key, expose[key]);
            });
        }

        server.events.on('stop', () => {
            for (const client of [].concat(expose.client)) {

                server.log(['hapi-postgresql', 'info'], 'close pg client and pool');

                client.end((err) => {
                    if (err) {
                        server.log(['hapi-postgresql', 'client', 'error'], err);
                    }
                });

                pool.end((err) => {
                    if (err) {
                        server.log(['hapi-postgresql', 'pool', 'error'], err);
                    }
                });

            }
        });
    },
};
