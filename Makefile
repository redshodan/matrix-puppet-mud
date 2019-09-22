all:
	npm install

run:
	node index.js -c config.yaml

clean:
	rm -rf node_modules/ package-lock.json npm-debug.log

docker-build:
	docker build -t matrix-puppet-mud .

docker-run:
	docker-compose up -d matrix-puppet-mud

docker-dev:
	docker-compose up matrix-puppet-mud

docker-logs:
	docker logs -f matrix-puppet-mud

docker-stop:
	docker kill matrix-puppet-mud
