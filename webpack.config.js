const path = require('path');
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

module.exports = async (env, options) => {
  const prod = options.mode === "production";
  const config = {
    devtool: prod ? 'source-map' : 'inline-source-map',
    target: "web",
    entry: {
      'block-duplicate-observer': './src/block-duplicate-observer.ts',
      'block-duplicate-project-admin': './src/block-duplicate-project-admin.tsx'
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            sourceMap: prod,
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
        {
          test: /\.html$/,
          use: "file-loader",
        },
      ],
    },
    resolve: {
      extensions: [ '.html','.css','.scss', '.ts', '.tsx', '.js' ],
      alias: {
        "azure-devops-ui": path.resolve("node_modules/azure-devops-ui"),
        "azure-devops-extension-sdk": path.resolve("node_modules/azure-devops-extension-sdk"),
        "azure-devops-extension-api": path.resolve("node_modules/azure-devops-extension-api")
    },
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
    },
    plugins: [
      new CleanWebpackPlugin({
        verbose: true, 
        dry: false, 
        cleanOnceBeforeBuildPatterns: [
          'dist/*',
        ],
      })
    ]
  };
  return config;
};