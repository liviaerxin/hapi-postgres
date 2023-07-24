'use strict';

const Hapi = require('@hapi/hapi');

const init = async () => {
    const server = Hapi.server({
        port: 4000,
        host: '0.0.0.0',
        debug: { log: ['hapi-postgresql'] },
    });

    await server.register({
        plugin: require('../lib'),
        options: {
            settings: {
                // connectionString: 'postgres://postgres:mysecretpassword@localhost:5432/db',
                host: 'localhost',
                port: 5432,
                database: 'db',
                user: 'postgres',
                password: 'mysecretpassword',
            },
            decorate: true,
        },
    });

    server.route({
        method: 'GET',
        path: '/test',
        async handler(request) {
            const pool = request.pg.pool;
            console.log(pool);

            try {
                const { fields, rows } = await pool.query('SELECT NOW() as now');
                console.error('fields', fields);
                console.error('rows', rows);

                return { fields, rows };
            } catch (err) {
                console.error('pg query', err);
            }
        },
    });

    await server.start();
    console.log('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', err => {
    console.log(err);
    process.exit(1);
});

init();
