# 

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