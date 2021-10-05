const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: "production",
  target: "web",
  entry: {
    'block-duplicate-observer': './src/block-duplicate-observer.ts',
    'block-duplicate-project-admin': './src/block-duplicate-project-admin.tsx'
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          output: {
            comments: false,
          },
        },
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.scss$/,
        use: ["style-loader", "css-loader","azure-devops-ui/buildScripts/css-variables-loader", "sass-loader"]
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
          test: /\.(png|jpe?g|gif)$/i,
          loader: "file-loader",
          options: {
            outputPath: '../images',
          },
      },
      {
        test: /\.woff$/,
        use: [{
            loader: 'base64-inline-loader'
        }]
    },
    ],
  },
  resolve: {
    extensions: [ '.html','.css','.scss', '.ts', '.tsx', '.js' ],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  plugins: [
	]
};