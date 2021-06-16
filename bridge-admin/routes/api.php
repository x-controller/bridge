<?php

use App\Models\Chain;
use App\Models\Token;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::get("chains", function (Request $request) {
    $data = Chain::all();
    return response()->json($data);
});

//Route::get("tokens", function (Request $request) {
//    $mainId = $request->input("mainId");
//    if (null == $mainId) {
//        $data = Token::all();
//    } else {
//        $data = Token::query()->where("mainId", $mainId)->get();
//    }
//    return response()->json($data);
//});

Route::get("items", function (Request $request) {
    $chainId = $request->input("chain");
    $fromChain = Chain::query()->where("chainId", $chainId)->first();
    if (!$fromChain) {
        return response()->json([
            'code' => 500,
            'msg' => "功能暂不支持该链"
        ]);
    }
    $token = $request->input("token");
    $items = Token::query()->where("fromChain", $fromChain->id)->when($token, function (Builder $builder, $fromToken) {
        return $builder->where("fromToken", $fromToken);
    })->orderBy("sort")->get();
    foreach ($items as $item) {
        $item->fromChainData = Chain::query()->where("id", $item->fromChain)->first();
        $item->toChainData = Chain::query()->where("id", $item->toChain)->first();
    }
    $grouped = $items->groupBy('name');

    return response()->json([
        'code' => 0,
        'data' => $grouped->all()
    ]);
});