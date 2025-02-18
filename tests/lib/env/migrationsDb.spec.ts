import AWS from 'aws-sdk';
import AWSMock from 'aws-sdk-mock';
import DynamoDB, { CreateTableInput, PutItemInput, DescribeTableInput, ScanInput, ItemList, DeleteItemInput } from 'aws-sdk/clients/dynamodb';
import sinon from 'sinon';

import * as migrationsDb from "../../../src/lib/env/migrationsDb";
import * as config from "../../../src/lib/env/config";


describe("migrationsDb", () => {

    afterEach(() => AWSMock.restore('DynamoDB'));

    describe("configureMigrationsLogDbSchema()", () => {
        it("should resolve when no errors are thrown while creating migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'createTable', (_params: CreateTableInput, callback: (error: Error | null) => void) => {
                callback(null);
            });
            AWSMock.mock('DynamoDB', 'waitFor', (_state: "tableExists", _params: DescribeTableInput, callback: (error: Error | null, responseObj: { pk: string, sk: string }) => void) => {
                callback(null, { pk: 'foo', sk: 'bar' });
            });
            await expect(migrationsDb.configureMigrationsLogDbSchema(new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).resolves.not.toThrow();
        })

        it("should reject when error is thrown while creating migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'createTable', (_params: CreateTableInput, callback: (error: Error | null) => void) => {
                callback(new Error("Could not create table Migrations_Log"));
            });
            await expect(migrationsDb.configureMigrationsLogDbSchema(new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).rejects.toThrowError("Could not create table Migrations_Log");
        })

        it("should reject when error is thrown while waiting for migrationsLogDb table to be active", async () => {
            AWSMock.mock('DynamoDB', 'createTable', (_params: CreateTableInput, callback: (error: Error | null) => void) => {
                callback(null);
            });
            AWSMock.mock('DynamoDB', 'waitFor', (_state: "tableExists", _params: DescribeTableInput, callback: (error: Error | null, responseObj: { pk: string, sk: string } | null) => void) => {
                callback(new Error('Table is not active'), null);
            });
            await expect(migrationsDb.configureMigrationsLogDbSchema(new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).rejects.toThrowError("Table is not active");
        })
    })

    describe("addMigrationToMigrationsLogDb()", () => {
        it("should resolve when no errors are thrown while adding migration to migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'putItem', (_params: PutItemInput, callback: (error: Error | null, responseObj: { pk: string, sk: string }) => void) => {
                callback(null, { pk: 'foo', sk: 'bar' });
            })
            await expect(migrationsDb.addMigrationToMigrationsLogDb({ fileName: "abc.ts", appliedAt: "20201014172343" }, new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).resolves.not.toThrow();
        })

        it("should reject when error is thrown while adding migration to migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'putItem', (_params: PutItemInput, callback: (error: Error | null, responseObj: { pk: string, sk: string } | null) => void) => {
                callback(new Error("Resource Not Found"), null);
            })
            await expect(migrationsDb.addMigrationToMigrationsLogDb({ fileName: "abc.ts", appliedAt: "20201014172343" }, new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).rejects.toThrow("Resource Not Found");
        })
    })

    describe("deleteMigrationFromMigrationsLogDb()", () => {
        it("should resolve when no errors are thrown while deleting migration", async () => {
            AWSMock.mock('DynamoDB', 'deleteItem', (_params: DeleteItemInput, callback: (error: Error | null, responseObj: { pk: string, sk: string }) => void) => {
                callback(null, { pk: 'foo', sk: 'bar' });
            })

            const item: { fileName: string; appliedAt: string } = {
                fileName: "123.ts",
                appliedAt: "123"
            };
            await expect(migrationsDb.deleteMigrationFromMigrationsLogDb(item, new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).resolves.not.toThrow();

        })

        it("should reject when error is thrown while deleting migration", async () => {
            AWSMock.mock('DynamoDB', 'deleteItem', (_params: DeleteItemInput, callback: (error: Error | null, responseObj: { pk: string, sk: string } | null) => void) => {
                callback(new Error("Could not delete migration"), null);
            });

            const item: { fileName: string; appliedAt: string } = {
                fileName: "123.ts",
                appliedAt: "123"
            };
            await expect(migrationsDb.deleteMigrationFromMigrationsLogDb(item, new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).rejects.toThrow("Could not delete migration");

        })
    })

    describe("doesMigrationsLogDbExists()", () => {
        it("should resolve when no errors are thrown while describing migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'describeTable', (_params: DescribeTableInput, callback: (error: Error | null) => void) => {
                callback(null);
            });
            await expect(migrationsDb.doesMigrationsLogDbExists(new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).resolves.toBeTruthy();

        })

        it("should reject when error is thrown while describing migrationsLogDb", async () => {
            AWSMock.mock('DynamoDB', 'describeTable', (_params: DescribeTableInput, callback: (error: Error | null) => void) => {
                callback(new Error("Resource Not Found"));
            })
            await expect(migrationsDb.doesMigrationsLogDbExists(new AWS.DynamoDB({ apiVersion: '2012-08-10' }))).resolves.toBeFalsy();

        })
    })

    describe("getAllMigrations()", () => {
        it("should return a migrations array", async () => {
            const Items: ItemList = [{
                FILE_NAME: { S: "abc.ts" },
                APPLIED_AT: { S: "123" }
            },
            {
                FILE_NAME: { S: "def.ts" },
                APPLIED_AT: { S: "124" }
            }];

            AWSMock.mock('DynamoDB', 'scan', (_params: ScanInput, callback: (error: Error | null, responseObj: { Items: ItemList; }) => void) => {
                callback(null, { Items });
            });

            const migrations = await migrationsDb.getAllMigrations(new AWS.DynamoDB({ apiVersion: '2012-08-10' }));
            expect(migrations).toStrictEqual([{ FILE_NAME: "abc.ts", APPLIED_AT: "123" }, { FILE_NAME: "def.ts", APPLIED_AT: "124" }]);

        });

        it("should make recursive calls and return the data of all recursive calls in single array", async () => {
            const stub = sinon.stub();
            let Items: ItemList = [{
                FILE_NAME: { S: "1.ts" },
                APPLIED_AT: { S: "1" }
            },
            {
                FILE_NAME: { S: "2.ts" },
                APPLIED_AT: { S: "2" }
            }];

            const LastEvaluatedKey: AWS.DynamoDB.Key = {
                FILE_NAME: { S: "2.ts" },
                APPLIED_AT: { S: "2" }
            };


            stub.onCall(0).returns({ Items, LastEvaluatedKey });
            Items = [
                {
                    FILE_NAME: { S: "3.ts" },
                    APPLIED_AT: { S: "3" }
                }
            ]
            stub.onCall(1).returns({ Items });

            AWSMock.mock('DynamoDB', 'scan', (_params: ScanInput, callback: (error: Error | null, stub: sinon.SinonStub) => void) => {
                callback(null, stub());
            });
            const migrations = await migrationsDb.getAllMigrations(new AWS.DynamoDB({ apiVersion: '2012-08-10' }));
            expect(migrations).toStrictEqual([{ FILE_NAME: "1.ts", APPLIED_AT: "1" }, { FILE_NAME: "2.ts", APPLIED_AT: "2" }, { FILE_NAME: "3.ts", APPLIED_AT: "3" }]);

        })
    })

    describe("AWS config loading from config file", () => {
        it("should throw error if region is not defined in config file", async () => {
            jest.spyOn(config, "loadAWSConfig").mockResolvedValue([{
                region: ''
            }]);
            await expect(migrationsDb.getDdb()).rejects.toThrow(new Error('Please provide region for profile:default'));
        });

        it("should configure AWS with credentials from config file when config file contains access and secret access keys", async () => {
            jest.spyOn(config, "loadAWSConfig").mockResolvedValue([{
                region: 'testRegion',
                accessKeyId: 'testAccess',
                secretAccessKey: 'testSecret'

            }]);
            const dynamodb = await migrationsDb.getDdb();
            expect(dynamodb.config.region).toStrictEqual('testRegion');
            expect(dynamodb.config.credentials?.accessKeyId).toStrictEqual('testAccess');
            expect(dynamodb.config.credentials?.secretAccessKey).toStrictEqual('testSecret');
        });

        it("should configure AWS credentials from shared credentials file when credentials are not provided in config file", async () => {
            jest.spyOn(AWS, "SharedIniFileCredentials").mockImplementation(() => {
                return new AWS.Credentials({
                    "accessKeyId": "testAccess",
                    "secretAccessKey": "testSecret"
                })
            });
            jest.spyOn(config, "loadAWSConfig").mockResolvedValue([{
                region: 'testRegion'
            }]);
            const dynamodb = await migrationsDb.getDdb();
            expect(dynamodb.config.region).toStrictEqual('testRegion');
            expect(dynamodb.config.credentials?.accessKeyId).toStrictEqual('testAccess');
            expect(dynamodb.config.credentials?.secretAccessKey).toStrictEqual('testSecret');
        });

        it("should configure AWS with credentials from config file based on input profile", async () => {
            jest.spyOn(config, "loadAWSConfig").mockResolvedValue([{
                region: 'defaultRegion',
                accessKeyId: 'defaultAccess',
                secretAccessKey: 'defaultSecret'
            },
            {
                profile: 'dev',
                region: 'devRegion',
                accessKeyId: 'devAccess',
                secretAccessKey: 'devSecret'
            },
            {
                profile: 'test',
                region: 'testRegion',
                accessKeyId: 'testAccess',
                secretAccessKey: 'testSecret'
            }]);

            const dynamodbTest = await migrationsDb.getDdb('test');
            expect(dynamodbTest.config.region).toStrictEqual('testRegion');
            expect(dynamodbTest.config.credentials?.accessKeyId).toStrictEqual('testAccess');
            expect(dynamodbTest.config.credentials?.secretAccessKey).toStrictEqual('testSecret');

            const dynamodbDev = await migrationsDb.getDdb('dev');
            expect(dynamodbDev.config.region).toStrictEqual('devRegion');
            expect(dynamodbDev.config.credentials?.accessKeyId).toStrictEqual('devAccess');
            expect(dynamodbDev.config.credentials?.secretAccessKey).toStrictEqual('devSecret');

            const dynamodbDevDefault = await migrationsDb.getDdb('default');
            expect(dynamodbDevDefault.config.region).toStrictEqual('defaultRegion');
            expect(dynamodbDevDefault.config.credentials?.accessKeyId).toStrictEqual('defaultAccess');
            expect(dynamodbDevDefault.config.credentials?.secretAccessKey).toStrictEqual('defaultSecret');
        });

        it('should update configure dynamo endpoint base on input file', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([{
                region: 'testRegion',
                dynamoDbEndpoint: 'http://localhost:4567',
            }]);

            const dynamodbTest = await migrationsDb.getDdb();
            expect(dynamodbTest.config.region).toStrictEqual('testRegion');
            expect(dynamodbTest.config.endpoint).toStrictEqual('http://localhost:4567');
            expect(dynamodbTest.config.credentials).toBeDefined()
        });

        it('should update configure dynamo endpoint and default credential base on input file', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([{
                region: 'testRegion',
                dynamoDbEndpoint: 'http://localhost:4567',
                mode: 'local',
            }]);

            const dynamodbTest = await migrationsDb.getDdb();
            expect(dynamodbTest.config.region).toStrictEqual('testRegion');
            expect(dynamodbTest.config.endpoint).toStrictEqual('http://localhost:4567');
            expect(dynamodbTest.config.credentials).toBeNull()
        });

        it('should load dynamodb instance base on endpoint of input file', async () => {
            jest.spyOn(config, 'loadAWSConfig').mockResolvedValue([{
                region: 'testRegion',
                mode: 'local',
            }]);
            jest.spyOn(AWS, 'DynamoDB').mockImplementation(() => {
                return new DynamoDB({ endpoint: 'http://localhost:4567' })
            });

            jest.doMock('aws-sdk', () => {
                return {
                    config: {
                        credentials: null
                    }         
                }
            });

            const AWSMocked = require('aws-sdk');

            const dynamodbTest = await migrationsDb.getDdb();
            expect(AWSMocked.config.credentials).toBeNull();
            expect(dynamodbTest).toBeDefined();
            expect(dynamodbTest).toBeDefined();
            expect(dynamodbTest.config.region).toStrictEqual('testRegion');
            expect(dynamodbTest.config.endpoint).toStrictEqual('http://localhost:4567');
            expect(dynamodbTest.config.credentials).toBeNull();
        })
    })
})