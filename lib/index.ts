import { DynamoDBDocument, GetCommand, GetCommandInput, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { BatchWriteItemInput, CreateTableCommand, DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { SessionData, Store } from 'express-session';

interface DynamoDBSessionStoreOptions {
    table?: string;
    client?: DynamoDBDocument;
}

export class DynamoDBSessionStore extends Store {
    private client: DynamoDBDocument;
    private table: string;

    constructor(options: DynamoDBSessionStoreOptions) {
        super();

        if (options.client) {
            this.client = DynamoDBDocument.from(options.client);
        } else {
            this.client = DynamoDBDocument.from(new DynamoDBClient({}));
        }

        if (options.table) {
            this.table = options.table;
        } else {
            this.table = "sessions";
        }

        this.createTableIfNotExists();
    }

    async createTableIfNotExists(): Promise<void> {
        try {
            await this.client.send(new DescribeTableCommand({ TableName: this.table }));

            await this.updateTableTTL();
        } catch (error: any) {
            if (error.name === "ResourceNotFoundException") {
                const params = {
                    TableName: this.table,
                    KeySchema: [
                        { AttributeName: "sessionId", KeyType: "HASH" }
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "sessionId", AttributeType: "S" }
                    ],
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5,
                    }
                };

                await this.client.send(new CreateTableCommand(params));
            } else {
                console.error(
                    "Error checking for the existence of the DynamoDB table:",
                    error
                );
            }
        }
    }

    async updateTableTTL(): Promise<void> {
        try {
            const describeResult = await this.client.send(new DescribeTimeToLiveCommand({ TableName: this.table }));
            const ttlStatus = describeResult.TimeToLiveDescription?.TimeToLiveStatus;
    
            if (ttlStatus === "DISABLED" || ttlStatus === "DISABLING") {
                const params = {
                    TableName: this.table,
                    TimeToLiveSpecification: {
                        AttributeName: "expireTime_TTL",
                        Enabled: true,
                    },
                };
                await this.client.send(new UpdateTimeToLiveCommand(params));
            }
        } catch (error) {
            console.error("Error updating TTL for the DynamoDB table:", error);
        }
    }

    async get(sessionId: string, callback: (err: any, session: SessionData | null) => void): Promise<void> {
        try {
            const getParams: GetCommandInput = {
                TableName: this.table,
                Key: {
                    sessionId: sessionId,
                },
            };

            const getResult = await this.client.send(new GetCommand(getParams));

            if (getResult.Item) {
                const session = JSON.parse(getResult.Item.session);
                callback(null, session);
            } else {
                callback(null, null);
            }
        } catch (error) {
            callback(error, null);
        }
    }

    async set(
        sid: string,
        session: SessionData,
        callback?: (err?: any) => void
    ): Promise<void> {
        try {
            const expireTime = session.cookie?.expires
                ? new Date(session.cookie.expires).getTime()
                : null;
            const expireTime_TTL = expireTime ? Math.floor(expireTime / 1000) : null;

            const getParams: GetCommandInput = {
                TableName: this.table,
                Key: {
                    sessionId: sid,
                },
            };

            const getResult = await this.client.send(new GetCommand(getParams));

            if (getResult.Item) {
                await Promise.all([
                    this.client.delete({
                        TableName: this.table,
                        Key: {
                            sessionId: sid
                        },
                    }),
                    this.client.put({
                        TableName: this.table,
                        Item: {
                            sessionId: sid,
                            expireTime: expireTime,
                            expireTime_TTL: expireTime_TTL,
                            session: JSON.stringify(session),
                        },
                    }),
                ]);
            } else {
                await this.client.put({
                    TableName: this.table,
                    Item: {
                        sessionId: sid,
                        expireTime: expireTime,
                        expireTime_TTL: expireTime_TTL,
                        session: JSON.stringify(session),
                    },
                });
            }

            callback?.();
        } catch (error) {
            callback?.(error);
        }
    }

    async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
        try {
            const getParams: GetCommandInput = {
                TableName: this.table,
                Key: {
                    sessionId: sid,
                },
            };

            const getResult = await this.client.send(new GetCommand(getParams));

            if (getResult.Item) {
                await this.client.delete({
                    TableName: this.table,
                    Key: { sessionId: sid },
                });
                callback && callback();
            } else {
                callback && callback(new Error('Not found session ID'));
            }

        } catch (error) {
            callback && callback(error);
        }
    }

    async length(callback: (err: any, length?: number) => void): Promise<void> {
        try {
            const result = await this.client.scan({ TableName: this.table });
            callback(null, result.Items?.length || 0);
        } catch (error) {
            callback(error);
        }
    }

    async touch(sid: string, session: SessionData, callback?: (err?: any) => void): Promise<void> {
        try {
            const expireTime = session.cookie.expires ? new Date(session.cookie.expires).getTime() : null;
            const expireTime_TTL = expireTime ? Math.floor(expireTime / 1000) : null;

            const getParams: GetCommandInput = {
                TableName: this.table,
                Key: {
                    sessionId: sid,
                },
            };

            const getResult = await this.client.send(new GetCommand(getParams));

            if (getResult.Item) {

                await Promise.all([
                    this.client.delete({
                        TableName: this.table,
                        Key: { sessionId: sid },
                    }),
                    this.client.put({
                        TableName: this.table,
                        Item: {
                            sessionId: sid,
                            expireTime: expireTime,
                            expireTime_TTL: expireTime_TTL,
                            session: JSON.stringify(session),
                        },
                    }),
                ]);
            }

            callback && callback();
        } catch (error) {
            callback && callback(error);
        }
    }

    async reap(callback?: (err?: any) => void): Promise<void> {
        try {
            const currentTime = Date.now();
            const scanParams: ScanCommandInput = {
                TableName: this.table,
                FilterExpression: '#expireTime < :currentTime',
                ExpressionAttributeNames: {
                    '#expireTime': 'expireTime',
                },
                ExpressionAttributeValues: {
                    ':currentTime': currentTime
                },
            };

            const scanResult = await this.client.scan(scanParams);

            const deleteRequests = (scanResult.Items || []).map((expiredSession) => ({
                DeleteRequest: {
                    Key: {
                        sessionId: expiredSession.sessionId
                    },
                },
            }));

            const writeParams: BatchWriteItemInput = {
                RequestItems: {
                    [this.table]: deleteRequests,
                },
            };

            await this.client.batchWrite(writeParams);

            callback && callback();
        } catch (error) {
            callback && callback(error);
        }
    }

    async all(callback: (err: any, sessions?: { [sid: string]: SessionData } | null) => void): Promise<void> {
        try {
            const result = await this.client.scan({ TableName: this.table });
            const sessions: { [sid: string]: SessionData } = {};

            result.Items?.forEach((item) => {
                sessions[item.sessionId] = JSON.parse(item.session);
            });

            callback(null, sessions);
        } catch (error) {
            callback(error);
        }
    }
}