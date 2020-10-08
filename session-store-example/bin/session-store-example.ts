#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { SessionStoreExampleStack } from '../lib/session-store-example-stack';

const app = new cdk.App();
new SessionStoreExampleStack(app, 'SessionStoreExampleStack');
