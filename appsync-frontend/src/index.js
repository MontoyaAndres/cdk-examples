import React from 'react';
import ReactDOM from 'react-dom';
import Amplify from 'aws-amplify';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  NavLink,
} from 'react-router-dom';

import './index.css';
import { Root } from './components/Root';
import { Login } from './components/Login';
import { Home } from './components/Home';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_NK9kSOnzs',
    userPoolWebClientId: '7ld4pggf3bmmuq4scl82lj50mo',
    mandatorySignIn: true,
  },
});

const myAppConfig = {
  aws_appsync_graphqlEndpoint:
    'https://4slpdoglwrdnjkyortq53tudfq.appsync-api.us-east-2.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-2',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
};

Amplify.configure(myAppConfig);

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <div id="app">
        <div id="nav">
          <NavLink exact to="/" activeClassName="active">
            Root
          </NavLink>
          <NavLink exact to="/login" activeClassName="active">
            LogIn
          </NavLink>
          <NavLink exact to="/home" activeClassName="active">
            Home
          </NavLink>
        </div>
      </div>
      <Switch>
        <Route exact path="/login">
          <Login />
        </Route>
        <Route exact path="/home">
          <Home />
        </Route>
        <Route exact path="/">
          <Root />
        </Route>
      </Switch>
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);
