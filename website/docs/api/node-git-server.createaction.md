---
id: node-git-server.createaction
hide_title: true
custom_edit_url: null
title: createAction() function
---

<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) > [node-git-server](./node-git-server.md) > [createAction](./node-git-server.createaction.md)

## createAction() function

responds with the correct service depending on the action

<b>Signature:</b>

```typescript
export declare function createAction(opts: any, req: http.IncomingMessage, res: http.ServerResponse): Service;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  opts | any | options to pass Service |
|  req | http.IncomingMessage | http request object |
|  res | http.ServerResponse | http response |

<b>Returns:</b>

[Service](./node-git-server.service.md)