import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as apigw from '@aws-cdk/aws-apigateway';

export class SessionStoreExampleStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'SessionStoreTable', {
      partitionKey: { name: 'SessionId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'TTL',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: { name: 'Username', type: dynamodb.AttributeType.STRING },
    });

    const layer = new lambda.LayerVersion(this, 'session-store-layer', {
      code: lambda.Code.fromAsset('src/layers'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
    });
    /* layer.addPermission('remote-account-grant', { accountId: '648594647853' }); */

    const createSessionFunction = new lambda.Function(
      this,
      'CreateSessionHandler',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset('src/functions/createSession'),
        handler: 'index.handler',
        layers: [layer],
        environment: {
          SESSION_STORE_TABLE_NAME: table.tableName,
        },
      }
    );
    table.grantWriteData(createSessionFunction);

    const getSessionFunction = new lambda.Function(this, 'GetSessionHandler', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset('src/functions/getSession'),
      handler: 'index.handler',
      layers: [layer],
      environment: {
        SESSION_STORE_TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(getSessionFunction);

    const deleteSessionsForUserFunction = new lambda.Function(
      this,
      'DeleteSessionsForUserHandler',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset('src/functions/deleteSessionsForUser'),
        handler: 'index.handler',
        layers: [layer],
        environment: {
          SESSION_STORE_TABLE_NAME: table.tableName,
          INDEX_NAME: 'UserIndex',
        },
      }
    );
    table.grantWriteData(deleteSessionsForUserFunction);

    const api = new apigw.RestApi(this, 'session-store');

    const createSession = api.root.resourceForPath('sessions');
    createSession.addMethod(
      'POST',
      new apigw.LambdaIntegration(createSessionFunction)
    );
    const getSession = api.root.resourceForPath('sessions');
    getSession.addMethod(
      'GET',
      new apigw.LambdaIntegration(getSessionFunction)
    );
    const deleteSessionsForUser = api.root.resourceForPath(
      'sessions/{username}'
    );
    deleteSessionsForUser.addMethod(
      'DELETE',
      new apigw.LambdaIntegration(deleteSessionsForUserFunction)
    );

    new cdk.CfnOutput(this, 'HTTP API URL', {
      value: api.url ?? 'Something went wrong with the deploy',
    });
  }
}
