import * as cdk from '@aws-cdk/core';
import * as apiGateway from '@aws-cdk/aws-apigateway';
import * as s3 from '@aws-cdk/aws-s3';

import { TodoBackend } from './todo-backend';

export class TodoAppStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const todoBackend = new TodoBackend(this, 'TodoBackend');

    new apiGateway.LambdaRestApi(this, 'Endpoint', {
      handler: todoBackend.handler,
    });

    const logoBucket = new s3.Bucket(this, 'LogoBucket', {
      publicReadAccess: true,
    });

    /* new s3Deployment.BucketDeployment(this, 'DeployMyImage', {
      destinationBucket: logoBucket,
      sources: [s3Deployment.Source.asset('./assets')],
    }); */

    /* const helloLambda = new lambda.Function(this, 'HelloLambda', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'functions')),
      handler: 'hello.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        isProduction: 'false',
      },
    });

    new apiGateway.LambdaRestApi(this, 'Endpoint', {
      handler: helloLambda,
    });

    logoBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(helloLambda)
    ); */
  }
}
