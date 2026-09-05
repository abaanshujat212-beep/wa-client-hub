const test=require("node:test");const assert=require("node:assert/strict");const {GenericApiRepository}=require("../src/generic-api/repository");
test("generic API key hashes are deterministic and never plaintext",()=>{const repo=new GenericApiRepository({});assert.equal(repo.hash("key"),repo.hash("key"));assert.notEqual(repo.hash("key"),"key");});
