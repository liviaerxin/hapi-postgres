'use strict';

const pg = require('pg');

const Joi = require('joi');

const client = new Client({
    host: 'my.database-server.com',
    port: 5334,
    database: 'database-name',
    user: 'database-user',
    password: 'secretpassword!!',
});

const pool = new Pool({
    host: 'my.database-server.com',
    port: 5334,
    database: 'database-name',
    user: 'database-user',
    password: 'secretpassword!!',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const singleOption = Joi.object({
  settings: [Joi.string().default('mysql://localhost/test'), Joi.object()],
  decorate: [true, Joi.string()],
}).strict();
const optionsSchema = Joi.array().items(singleOption).min(1).single();

exports.plugin = {
    pkg: require('../package.json'),
    register: async function (server, pluginOptions) {
        const { value: options } = await optionsSchema.validate(pluginOptions);

        const decorationTypes = new Set(
            options.map(option => typeof option.decorate),
        );
        if (decorationTypes.size > 1) {
            throw new Error(
                'You cannot mix different types of decorate options',
            );
        }
        const expose = {
            lib: pg,
        };

        async function connect(connectionOptions) {

            const pool = new pg.Pool(connectionOptions.settings);
            const { user, host, database } = connectionOptions.settings
            const info = `${user}@${host}/${database}`;

            server.log(
                ['hapi-postgresql', 'info'],
                `hapi connection created for ${info}`,
            );
            if (typeof connectionOptions.decorate === 'string') {
                const decoration = Object.assign({ pool }, expose);
                server.decorate(
                    'server',
                    connectionOptions.decorate,
                    decoration,
                );
                server.decorate(
                    'request',
                    connectionOptions.decorate,
                    decoration,
                );
            }
            return pool;
        }

        try {
            const pools = await Promise.all(options.map(connect));
            expose.pool = options.length === 1 ? pools[0] : pools;
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
    },
};
