'use strict';

const pg = require('pg');
const Joi = require('joi');

const singleOption = Joi.object({
    settings: [
        Joi.object().keys({
            user: Joi.string().optional(), // default process.env.PGUSER || process.env.USER
            password: Joi.string().optional(), //default process.env.PGPASSWORD
            host: Joi.string().optional(), // default process.env.PGHOST
            database: Joi.string().optional(), // default process.env.PGDATABASE || user
            port: Joi.number().optional(), // default process.env.PGPORT
            connectionString: Joi.string().optional(), // e.g. postgres://user:password@host:5432/database
            ssl: Joi.any().optional(), // passed directly to node.TLSSocket, supports all tls.connect options
            types: Joi.any().optional(), // custom type parsers
            statement_timeout: Joi.number().optional(), // number of milliseconds before a statement in query will time out, default is no timeout
            query_timeout: Joi.number().optional(), // number of milliseconds before a query call will timeout, default is no timeout
            application_name: Joi.string().optional(), // The name of the application that created this Client instance
            connectionTimeoutMillis: Joi.number().optional(), // number of milliseconds to wait for connection, default is no timeout
            idle_in_transaction_session_timeout: Joi.number().optional(), // number of milliseconds before terminating any session with an open idle transaction, default is no timeout
            idleTimeoutMillis: Joi.number().optional(), // default is 10000 (10 seconds) - set to 0 to disable auto-disconnection of idle clients
            max: Joi.number().optional(), // maximum number of clients the pool should contain by default this is set to 10.
            allowExitOnIdle: Joi.bool().optional(), // Default behavior is the pool will keep clients open & connected to the backend
        }),
    ],
    decorate: [Joi.bool(), Joi.string()],
}).strict();
const schema = Joi.array().items(singleOption).min(1).single();

exports.plugin = {
    pkg: require('../package.json'),
    register: async function (server, pluginOptions) {
        // const { value: options } = schema.validate(pluginOptions);
        let options;

        try {
            options = await schema.validateAsync(pluginOptions);
            // value -> { "a" : 123 }
        } catch (err) {
            server.log(['hapi-postgres', 'options', 'error'], err);
            throw err;
        }

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

            await client.connect();

            //TODO: retrieve connection host, port, username, password from configuration
            const { host, port, database, user, password } = client;
            const info = `postgres://${user}:${password}@${host}:${port}/${database}`;

            server.log(['hapi-postgres', 'info'], `postgres client connection created for ${info}`);

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
            server.log(['hapi-postgres', 'error'], err);
            throw err;
        }

        if (decorationTypes.has('boolean')) {
            server.decorate('server', 'pg', expose);
            server.decorate('request', 'pg', expose);
        } else if (decorationTypes.has('undefined')) {
            for (const key of Object.keys(expose)) {
                server.expose(key, expose[key]);
            }
        }

        server.events.on('stop', () => {
            for (const client of [].concat(expose.client)) {
                server.log(['hapi-postgres', 'info'], 'close pg client');

                client.end(err => {
                    if (err) {
                        server.log(['hapi-postgres', 'client', 'error'], err);
                    }
                });
            }

            for (const pool of [].concat(expose.pool)) {
                server.log(['hapi-postgres', 'info'], 'close pg pool');

                pool.end(err => {
                    if (err) {
                        server.log(['hapi-postgres', 'pool', 'error'], err);
                    }
                });
            }
        });
    },
};
