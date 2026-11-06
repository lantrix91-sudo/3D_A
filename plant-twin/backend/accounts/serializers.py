from rest_framework import serializers


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())


class ErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class ErrorSerializer(serializers.Serializer):
    error = ErrorDetailSerializer()
