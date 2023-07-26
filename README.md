# Hapi-Postgres

This is a plugin to expose a shared `PostgreSQL connection pool` across the whole Hapi server and each request.

It helps developers to concentrate on `query()` operation, reducing the burden to control `connect()` and `end()` operations before and after each `query()`.

## Getting Started

### Options

- **settings**: Optional. Provide settings to the connection. If you not configure it, most of settings will be initialized from your [environment variables](https://node-postgres.com/features/connecting#environment-variables) in default, See all supported at [https://node-postgres.com/apis/client#new-client](https://node-postgres.com/apis/client#new-client) and [https://node-postgres.com/apis/pool#new-pool](https://node-postgres.com/apis/pool#new-pool).
- **decorate**: Optional. Rather have exposed objects accessible through server and request decorations. You cannot mix different types of decorations.
  - If true, `server.pg` or `request.pg`
  - If it's a string, `server.<string>` or `request.<string>`

Several objects are exposed by this plugin:

- client: The single client of postgresql, an instance of `pg.Client`
- pool: The connection of pool of postgresql, an instance of `pg.Pool`
- lib: `node-postgre` library

### Example


### Test

```sh
node --watch server.js
node --watch-path=./src server.js
```

```http
GET http://127.0.0.1:4000 HTTP/1.1
```

```http
GET http://127.0.0.1:4000/test HTTP/1.1
```


```sh
docker run -it --rm \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=mysecretpassword \
    -e POSTGRES_DB=db \
    -p 5432:5432 \
    postgres
```

## Compatibility level

Ships with mongodb 3.x.


## References

[](https://github.com/Marsup/hapi-mongodb)