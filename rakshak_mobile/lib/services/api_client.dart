import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Why a request failed. This is what lets the UI say the TRUE reason
/// instead of always blaming "network unstable".
enum ApiFailure {
  /// Request succeeded (2xx).
  none,

  /// Could not reach the server: no internet, DNS failure, TLS error, timeout.
  network,

  /// 401 - token missing / expired.
  unauthorized,

  /// 5xx, 408 or 429 - server is having trouble; retrying later may work.
  server,

  /// Other 4xx - the server understood but REFUSED the data (bad/missing
  /// field, wrong URL, invalid signature...). Retrying the same data will
  /// never work.
  rejected,
}

class ApiOutcome {
  const ApiOutcome({
    required this.failure,
    this.statusCode,
    this.message = '',
    this.json,
  });

  final ApiFailure failure;
  final int? statusCode;
  final String message;

  /// Decoded JSON body when the body is a JSON object.
  final Map<String, dynamic>? json;

  bool get ok => failure == ApiFailure.none;

  /// Failures where it makes sense to keep the data and retry later.
  bool get shouldQueue =>
      failure == ApiFailure.network ||
      failure == ApiFailure.server ||
      failure == ApiFailure.unauthorized;

  /// Short human-readable reason, e.g. "HTTP 400: description is required".
  String get describe {
    if (statusCode != null) {
      return message.isEmpty ? 'HTTP $statusCode' : 'HTTP $statusCode: $message';
    }
    return message;
  }
}

class ApiClient {
  ApiClient._();

  static Future<ApiOutcome> postJson(
    String url, {
    required Map<String, dynamic> body,
    String? token,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
    final encodedBody = jsonEncode(body);

    http.Response response;
    try {
      response = await http
          .post(Uri.parse(url), headers: headers, body: encodedBody)
          .timeout(timeout);
    } on TimeoutException {
      return const ApiOutcome(
        failure: ApiFailure.network,
        message: 'Request timed out',
      );
    } on IOException catch (e) {
      // SocketException, HandshakeException, ...
      return ApiOutcome(
        failure: ApiFailure.network,
        message: 'Could not reach server ($e)',
      );
    } on http.ClientException catch (e) {
      return ApiOutcome(failure: ApiFailure.network, message: e.message);
    } catch (e) {
      return ApiOutcome(failure: ApiFailure.network, message: e.toString());
    }

    return _fromResponse(response);
  }

  static ApiOutcome _fromResponse(http.Response response) {
    final status = response.statusCode;
    Map<String, dynamic>? json;
    String message = '';

    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        json = decoded;
        final m = decoded['message'] ?? decoded['error'] ?? decoded['detail'];
        if (m != null) message = m.toString();
      }
    } catch (_) {
      final body = response.body.trim();
      message = body.length > 140 ? body.substring(0, 140) : body;
    }

    if (status >= 200 && status < 300) {
      return ApiOutcome(
        failure: ApiFailure.none,
        statusCode: status,
        message: message,
        json: json,
      );
    }

    final ApiFailure failure;
    if (status == 401) {
      failure = ApiFailure.unauthorized;
    } else if (status >= 500 || status == 408 || status == 429) {
      failure = ApiFailure.server;
    } else {
      failure = ApiFailure.rejected;
    }

    return ApiOutcome(
      failure: failure,
      statusCode: status,
      message: message,
      json: json,
    );
  }
}
