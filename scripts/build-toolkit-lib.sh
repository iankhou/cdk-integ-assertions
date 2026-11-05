#!/bin/sh
# Build @aws-cdk/toolkit-lib with the evaluate action, from the template-evaluation branch of iankhou/aws-cdk-cli,
# into .toolkit-lib/. scripts/evaluate.js uses it from there (or from TOOLKIT_LIB).
set -e
cd "$(dirname "$0")/.."
REPO=${AWS_CDK_CLI_REPO:-https://github.com/iankhou/aws-cdk-cli.git}
BRANCH=${AWS_CDK_CLI_BRANCH:-template-evaluation}
if [ -d .toolkit-lib/.git ]; then
  git -C .toolkit-lib fetch --depth 1 origin "$BRANCH" && git -C .toolkit-lib checkout -q FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" .toolkit-lib
fi
cd .toolkit-lib
yarn install --immutable
# nx's compile target doesn't run pre-compile, which generates cloud-assembly-schema's cli-version.json
(cd packages/@aws-cdk/cloud-assembly-schema && npx projen pre-compile)
npx nx run @aws-cdk/toolkit-lib:compile
# resources toolkit-lib loads at runtime (service spec database, cdk-from-cfn wasm, bootstrap template)
(cd packages/@aws-cdk/toolkit-lib && node build-tools/bundle.mjs)
echo "TOOLKIT_LIB=$PWD/packages/@aws-cdk/toolkit-lib"
