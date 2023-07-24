'use strict';

const Hapi = require('@hapi/hapi');
const Hoek = require('@hapi/hoek');
const Lab = require('@hapi/lab');
const Code = require('@hapi/code');
const Sinon = require('sinon');

const pg = require('pg');

const { expect } = Code;
const { after, before, beforeEach, describe, it } = (exports.lab = Lab.script());

describe('Hapi server', () => {
    let server;

    beforeEach(() => {
        server = Hapi.Server();
    });

    it('should reject invalid decorate', async () => {
        try {
            await server.register({
                plugin: require('../lib'),
                options: {
                    decorate: 123,
                },
            });
        } catch (err) {
            expect(err).to.exist();
        }
    });

    it('should fail with no postgres server listening', async () => {
        try {
            await server.register({
                plugin: require('../lib'),
                options: {
                    settings: {
                        connectionString: 'postgres://postgres:mysecretpassword@localhost:5433/db',
                    },
                },
            });
        } catch (err) {
            expect(err).to.exist();
        }
    });

    it('should fail with wrong postgres config', async () => {
        try {
            await server.register({
                plugin: require('../lib'),
                options: {
                    settings: {
                        connectionString: 'postgres://postgres123:mysecretpassword@localhost:5432/db',
                    },
                },
            });
        } catch (err) {
            expect(err).to.exist();
        }
    });

    it('should be able to register plugin with just URL settings', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
            },
        });
    });

    it('should log configuration upon successful connection', async () => {
        let logEntry;
        server.events.once('log', entry => {
            logEntry = entry;
        });

        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
            },
        });

        expect(logEntry).to.equal({
            channel: 'app',
            timestamp: logEntry.timestamp,
            tags: ['hapi-postgres', 'info'],
            data: 'postgres client connection created for postgres://postgres:mysecretpassword@localhost:5432/db',
        });
    });

    it('should be able to register plugin with specific settings', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    host: 'localhost',
                    port: 5432,
                    database: 'db',
                    user: 'postgres',
                    password: 'mysecretpassword',
                },
            },
        });
    });

    it('should handle other format of connection settings', async () => {
        let logEntry;
        server.events.once('log', entry => {
            logEntry = entry;
        });

        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    host: 'localhost',
                    port: 5432,
                    database: 'db',
                    user: 'postgres',
                    password: 'mysecretpassword',
                },
            },
        });

        expect(logEntry).to.equal({
            channel: 'app',
            timestamp: logEntry.timestamp,
            tags: ['hapi-postgres', 'info'],
            data: 'postgres client connection created for postgres://postgres:mysecretpassword@localhost:5432/db',
        });
    });

    it('should be able to find the plugin exposed objects', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
            },
        });

        server.route({
            method: 'GET',
            path: '/',
            handler(request) {
                const plugin = request.server.plugins['hapi-postgres'];
                expect(plugin.pool).to.exist();
                expect(plugin.client).to.exist();
                expect(plugin.lib).to.exist();
                return Promise.resolve(null);
            },
        });

        await server.inject({ method: 'GET', url: '/' });
    });

    it('should be able to find the plugin on decorated objects', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
                decorate: true,
            },
        });

        expect(server.pg.pool).to.exist();
        expect(server.pg.client).to.exist();
        expect(server.pg.lib).to.exist();

        server.route({
            method: 'GET',
            path: '/',
            handler(request) {
                expect(request.pg.pool).to.exist();
                expect(request.pg.client).to.exist();
                expect(request.pg.lib).to.exist();
                return Promise.resolve(null);
            },
        });

        await server.inject({ method: 'GET', url: '/' });
    });

    it('should be able to find the plugin on custom decorated objects', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
                decorate: 'db',
            },
        });

        expect(server.db.pool).to.exist();
        expect(server.db.client).to.exist();
        expect(server.db.lib).to.exist();

        server.route({
            method: 'GET',
            path: '/',
            handler(request) {
                expect(request.db.pool).to.exist();
                expect(request.db.client).to.exist();
                expect(request.db.lib).to.exist();
                return Promise.resolve(null);
            },
        });

        await server.inject({ method: 'GET', url: '/' });
    });

    it('should fail to mix different decorations', async () => {
        try {
            await server.register({
                plugin: require('../lib'),
                options: [
                    {
                        settings: {
                            connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                        },
                        decorate: true,
                    },
                    {
                        settings: {
                            connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                        },
                        decorate: 'foo',
                    },
                ],
            });
        } catch (err) {
            expect(err).to.be.an.error('You cannot mix different types of decorate options');
        }
    });

    it('should be able to have multiple connections', async () => {
        await server.register({
            plugin: require('../lib'),
            options: [
                {
                    settings: {
                        connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                    },
                },
                {
                    settings: {
                        connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                    },
                },
            ],
        });

        const plugin = server.plugins['hapi-postgres'];
        expect(plugin.client).to.be.an.array().and.to.have.length(2);
        plugin.client.forEach((client, i) => {
            expect(client).to.be.instanceof(pg.Client);
            expect(client.database).to.equal('db');
        });
    });

    it('should be able to find the plugin exposed objects', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
                decorate: true,
            },
        });

        const res = await server.pg.client.query('SELECT $1::text as message', ['Hello world!']);

        expect(res.rows[0].message).to.equal('Hello world!');
    });

    it('should disconnect if the server stops', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
                decorate: true,
            },
        });

        await server.initialize();
        await Hoek.wait(100);

        let logEntry;
        server.events.once('log', entry => {
            logEntry = entry;
        });

        await server.stop();
        await Hoek.wait(100); // Let the connections end.

        expect(logEntry).to.equal({
            channel: 'app',
            timestamp: logEntry.timestamp,
            tags: ['hapi-postgres', 'info'],
            data: 'close pg client',
        });

        try {
            const res = await server.pg.client.query('SELECT $1::text as message', ['Hello world!']);
        } catch (err) {
            expect(err).to.be.an.error('Client was closed and is not queryable');
        }

        try {
            const res = await server.pg.pool.query('SELECT $1::text as message', ['Hello world!']);
        } catch (err) {
            expect(err).to.be.an.error('Cannot use a pool after calling end on the pool');
        }
    });

    it('should logs errors on disconnect', async () => {
        await server.register({
            plugin: require('../lib'),
            options: {
                settings: {
                    connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                },
                decorate: true,
            },
        });

        await server.initialize();

        const logEntries = [];
        server.events.on('log', entry => {
            logEntries.push(entry);
        });

        const clientEndStub = Sinon.stub(server.pg.client, 'end').callsFake(cb => {
            setTimeout(cb, 0, new Error('Oops'));
        });

        const poolEndStub = Sinon.stub(server.pg.pool, 'end').callsFake(cb => {
            setTimeout(cb, 0, new Error('Oops'));
        });

        await server.stop();
        await Hoek.wait(100); // Let the connections end.

        expect(logEntries).to.have.length(4);
        expect(logEntries[2].tags).to.equal(['hapi-postgres', 'client', 'error']);
        expect(logEntries[2].error).to.be.an.error('Oops');
        expect(logEntries[3].tags).to.equal(['hapi-postgres', 'pool', 'error']);
        expect(logEntries[3].error).to.be.an.error('Oops');

        clientEndStub.restore();
        poolEndStub.restore();

        await server.pg.client.end();
        await server.pg.pool.end();
    });
});
